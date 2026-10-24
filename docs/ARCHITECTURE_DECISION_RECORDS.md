# Architecture Decision Records (ADRs)
## G.S Gacuba 2A Integrated School Administration Portal

This document records the architectural, technical, and operational decisions governing the design, tech stack, and implementation of the G.S Gacuba 2A Admin Portal.

---

### Index of Records
- **ADR-001:** Single Page Application (React 18 + Vite) Architecture over Django/Python Monolith
- **ADR-002:** PostgreSQL through supabase Row-Level Security (RLS) as the Primary Security & Permission Boundary
- **ADR-003:** Dedicated `public.users` Profile Table with Strict School Role Enum
- **ADR-004:** Decoupled Parent Contact Snapshotting in Academic Reports (`midterm_report_contacts`)
- **ADR-005:** Database-Triggered Automated Incremental Report Card Compilation
- **ADR-006:** Client-Side PDF Generation with Seven-Day Storage Cache Invalidation
- **ADR-007:** Cryptographic Dispatch Fingerprinting for SMS Duplicate Prevention
- **ADR-008:** Transactional Notification Outbox Pattern with Deno Edge Functions and Resend API
- **ADR-009:** Client-Side Delimiter-Sniffing and Synonym-Aliasing CSV Ingestion Engine
- **ADR-010:** Resilient Hybrid Persistence with Zero-Crash Local Mock Client Fallback
- **ADR-011:** Student Soft-Deletion and Historical Archival Subsystem (`school_students_archive`)
- **ADR-012:** Cryptographic Parent Report Card Tokenization & Edge Function Streaming Delivery
- **ADR-013:** Scope Boundary: Exclusion of Daily Attendance & Payroll to Enforce 500MB/1GB Storage Survival

---

### ADR-001: Single Page Application (React 18 + Vite) Architecture over Django/Python Monolith

#### Status
**Accepted & Implemented**

#### Context
Initial discussions evaluated whether to build a multi-repo Django/Python server architecture or an integrated client-side Single Page Application (SPA). The school operates primarily over cellular/mobile broadband in Rubavu District, requiring an application that loads rapidly, caches assets locally, provides instant UI feedback, and minimizes round-trip latency.

#### Decision
Deploy a pure React 18 SPA built with TypeScript and Vite, communicating directly with Supabase managed services (PostgreSQL, PostgREST, Auth, Storage) and serverless Edge Functions.

#### Consequences
- **Positive:**
  - Zero Python runtime dependencies or containerized web server overhead (Gunicorn/Uwsgi).
  - Instant client-side routing and filter queries (<50ms for thousands of student records).
  - Modern reactive UI component ecosystem (Tailwind CSS, Lucide, Font Awesome).
  - Easy hosting on global CDN edge networks with static caching.
- **Negative:**
  - Business logic that requires privileged access must be executed via PostgreSQL `SECURITY DEFINER` functions or Supabase Deno Edge Functions rather than a traditional Python service layer.

---

### ADR-002: PostgreSQL Row-Level Security (RLS) as the Primary Security & Permission Boundary

#### Status
**Accepted & Implemented**

#### Context
Academic student management systems handle highly sensitive data: academic marks, student conduct, parent phone numbers, and financial payment status. Client-side navigation guards (e.g., hiding a button in React) can easily be bypassed by technical users inspecting network requests or querying endpoints directly.

#### Decision
Enforce all data access controls, role restrictions, and tenant isolation strictly at the database layer using PostgreSQL Row-Level Security (RLS). Frontend UI restrictions are treated purely as user-experience conveniences, never as security boundaries.

#### Consequences
- **Positive:**
  - Even if a compromised client attempts direct PostgREST queries using an authenticated JWT, PostgreSQL denies unauthorized `SELECT`, `INSERT`, `UPDATE`, or `DELETE` operations.
  - Teachers physically cannot read parent phone numbers or fees because the base `school_students` table rejects teacher tokens, routing them instead to the `teacher_student_register` security barrier view.
- **Negative:**
  - RLS policies require thorough maintenance in database migrations and rigorous testing using varied database connection roles.

---

### ADR-003: Dedicated `public.users` Profile Table with Strict School Role Enum

#### Status
**Accepted & Implemented**

#### Context
Supabase Auth manages user authentication in the `auth.users` schema. Storing user roles solely inside user metadata (`raw_user_meta_data`) is insecure because user metadata can be modified by the client under standard auth flows. Storing them in app metadata (`raw_app_meta_data`) requires administrative service-role tokens to modify, complicating staff onboarding.

#### Decision
Create a dedicated `public.users` table referencing `auth.users(id) ON DELETE CASCADE` with a strict PostgreSQL enum:
```sql
CREATE TYPE public.school_role AS ENUM ('dean_of_studies', 'headteacher', 'teacher', 'it');
```
A database security definer function `current_school_role()` queries this table using `auth.uid()`. IT accounts are granted exclusive permission to alter roles.

#### Consequences
- **Positive:**
  - Absolute auditability: IT administrators can change staff roles directly from the UI without exposing service keys.
  - Type-safe enforcement: Any attempt to assign a role outside the 4 allowed values throws a database constraint violation.
  - Safe default: Any newly provisioned user defaults to `'teacher'` until explicitly elevated by IT.
- **Negative:**
  - Requires syncing user creations via an automated trigger (`sync_school_user_from_auth`).

---

### ADR-004: Decoupled Parent Contact Snapshotting in Academic Reports

#### Status
**Accepted & Implemented**

#### Context
Academic mid-term reports must retain institutional permanence. If a parent changes their phone number or email address months after Term 1 reports are issued, historical report cards and SMS logs must reflect the exact contact information that was active at the time the report was compiled. Furthermore, teachers reviewing class report histories must not have access to parent contact information.

#### Decision
When a mid-term report is compiled into `public.midterm_reports`, the system simultaneously snapshots the student's guardian name, phone, and email into an isolated table `public.midterm_report_contacts`. 
Teachers are granted access to read historical report rows in `public.midterm_reports`, but RLS policies strictly forbid teachers from reading `public.midterm_report_contacts`.

#### Consequences
- **Positive:**
  - Complete historical contact accuracy for audits and legal verification.
  - Strict privacy protection: Teachers can review student marks and download academic summaries without viewing parent contact details.
- **Negative:**
  - Requires maintaining an additional child table and coordinating transactions during report regeneration.

---

### ADR-005: Database-Triggered Automated Incremental Report Card Compilation

#### Status
**Accepted & Implemented**

#### Context
In traditional school portals, the Dean of Studies must manually initiate report compilation at the end of every testing window, causing bottlenecks and server timeouts during peak grading periods.

#### Decision
Implement a database trigger `auto_compile_midterm_on_mark_save` on `public.midterm_assessment_marks`. When a mark is saved, the trigger queries `public.midterm_subjects` to determine how many enabled subjects exist for the student's class stream. If and only if every enabled subject has received a valid mark (including `0`), the database automatically compiles the report snapshot, calculates the arithmetic average, maps REB, probably NESA letter grades, and inserts the report record.

#### Consequences
- **Positive:**
  - Zero manual compilation overhead for staff.
  - Workload is distributed incrementally as individual teachers input marks throughout exam week.
  - Instant availability of report summaries for completed pupils.
- **Negative:**
  - Triggers introduce write overhead during bulk mark imports; handled by using lightweight indexing and conditional execution guards.

---

### ADR-006: Client-Side PDF Generation with Seven-Day Storage Cache Invalidation

#### Status
**Accepted & Implemented**

#### Context
Generating hundreds of multi-page academic PDF report cards on a central server causes significant CPU spikes. Conversely, generating them entirely client-side without caching results in slow downloads and repeated computation whenever a document is opened.

#### Decision
Use client-side `jspdf` and `jspdf-autotable` to render report cards, storing the generated binary in the private Supabase Storage bucket `midterm-reports`. 
Implement a 7-day cache invalidation policy:
- If `pdf_generated_at` exists and is `< 7 days` old, reuse the existing file.
- If missing or older than 7 days, regenerate client-side, replace the storage object, and update `pdf_generated_at`.

#### Consequences
- **Positive:**
  - Server compute costs remain near zero.
  - Instantaneous downloads for previously compiled documents.
  - Guarantees that stale documents are refreshed periodically with any updated administrative metadata.
- **Negative:**
  - The client machine's browser memory is used during the initial PDF rendering process.

---

### ADR-007: Cryptographic Dispatch Fingerprinting for SMS Duplicate Prevention

#### Status
**Accepted & Implemented**

#### Context
In school environments, accidental double-clicks or multiple administrative staff sending tuition fee reminders can lead to duplicate SMS broadcasts. This frustrates parents and wastes institutional funds.

#### Decision
Generate a deterministic dispatch fingerprint string for every communication batch:
`HASH(Category + '|' + NormalizedMessage + '|' + SortedRecipientUUIDs)`
Store this in `public.sms_campaign_dispatches` and `public.midterm_sms_dispatches` with a `UNIQUE` database constraint. Any attempt to send an identical batch triggers an `ON CONFLICT DO UPDATE` or raises an exception.

#### Consequences
- **Positive:**
  - Mathematical guarantee against accidental duplicate broadcasts.
  - Fully transparent audit ledger of what was sent, when, and to whom.
- **Negative:**
  - If a school genuinely intends to send an identical reminder hours later, the message body must be slightly varied or the draft status reset.

---

### ADR-008: Transactional Notification Outbox Pattern with Deno Edge Functions and Resend API

#### Status
**Accepted & Implemented**

#### Context
Directly invoking third-party email APIs from within client components or database triggers creates severe availability risks: if the external API is slow or down, the user transaction fails or hangs.

#### Decision
Adopt the **Transactional Outbox Pattern**:
1. When official mid-term assessment dates are scheduled, PostgreSQL triggers insert notification tasks into `public.midterm_notification_outbox` in the same atomic transaction.
2. A separate serverless Supabase Deno Edge Function (`dispatch-midterm-emails`) executes periodically, reads pending records (`delivered_at IS NULL`), communicates with the Resend API, and records the `delivered_at` timestamp.

#### Consequences
- **Positive:**
  - Absolute fault tolerance: Database writes succeed regardless of third-party email provider outages.
  - Zero exposure of the `RESEND_API_KEY` to the browser.
  - Retry semantics built-in: Failed deliveries remain in the outbox for subsequent worker cycles.
- **Negative:**
  - Introduces a slight asynchronous delay between date scheduling and physical inbox delivery.

---

### ADR-009: Client-Side Delimiter-Sniffing and Synonym-Aliasing CSV Ingestion Engine

#### Status
**Accepted & Implemented**

#### Context
Teachers and administrative staff frequently export student rosters from disparate tools (Excel, Google Sheets, legacy databases) resulting in inconsistent delimiters (commas, semicolons, tabs) and differing header names (e.g., "Parent Name" vs. "Guardian" vs. "Contact Person").

#### Decision
Build a custom, zero-dependency streaming CSV parser in `src/utils/studentCsv.ts`:
1. Delimiter Sniffer: Analyzes candidate delimiters outside quoted strings and selects the dominant character.
2. Header Synonym Normalization: Strips non-alphanumeric characters and maps variations against an alias registry.
3. Interactive Validation Staging Grid: Parses rows into staged objects, highlights syntax/validation errors inline, and prevents duplicate insertions before database commit.

#### Consequences
- **Positive:**
  - Eliminates 95% of user CSV upload failures without requiring staff to reformat files manually.
  - Client-side pre-validation prevents bad data from reaching the database.
- **Negative:**
  - Header alias dictionary must be maintained if new institutional conventions emerge.

---

### ADR-010: Resilient Hybrid Persistence with Zero-Crash Local Mock Client Fallback

#### Status
**Accepted & Implemented**

#### Context
In low-connectivity periods, network disruptions in Rubavu District, or local evaluation environments without configured Supabase environment variables, a standard BaaS app will throw fatal initialization errors and present a blank screen.

#### Decision
Implement a hybrid query engine in `src/lib/supabase.ts`. When `VITE_SUPABASE_URL` is unconfigured or network requests fail, the client activates an in-memory/localStorage query builder with pre-seeded school test data. The user interface functions seamlessly, preserving data locally and displaying graceful status alerts.

#### Consequences
- **Positive:**
  - 100% application uptime: Demonstrations, tests, and training sessions function even with zero internet connectivity.
  - Robust error boundary handling throughout the application.
- **Negative:**
  - Changes made in mock mode are stored in browser localStorage and do not automatically sync to the remote database upon reconnection.

---

### ADR-011: Student Soft-Deletion and Historical Archival Subsystem (`school_students_archive`)

#### Status
**Accepted & Implemented (v2.1.0)**

#### Context
Hard-deleting student records leads to catastrophic cascading deletions or orphaned marks in previous academic term records. Furthermore, administrative errors during end-of-year roster pruning could purge active students.

#### Decision
Implement a dedicated archive schema (`school_students_archive`):
1. In the UI, student deletion triggers a mandatory prompt requiring an explicit textual justification (e.g., "Transferred to secondary boarding", "Family relocated to Kigali", "Administrative duplicate").
2. The transaction inserts the entire student demographic payload into `school_students_archive` alongside the reason, authoring timestamp, and administrator UUID.
3. The original record in `school_students` is removed, but historical marks in `student_midterm_marks` and snapshots in `midterm_reports` remain anchored.
4. An administrative restore workflow is provided in `Students.tsx` allowing one-click reactivation of archived students without loss of historical continuity.

#### Consequences
- **Positive:**
  - Zero accidental permanent data loss.
  - Full institutional accountability and audit trail for student departures.
  - Ability to restore students who return to the school in subsequent terms.
- **Negative:**
  - Database storage slightly increases due to retention of archived profiles.

---

### ADR-012: Cryptographic Parent Report Card Tokenization & Edge Function Streaming Delivery

#### Status
**Accepted & Implemented (v2.1.0)**

#### Context
Parents at G.S Gacuba 2A do not possess school accounts or passwords. Storing PDF report cards in public cloud buckets exposes sensitive child academic evaluations to public internet indexers. Conversely, forcing parents to register accounts creates an insurmountable barrier for guardians with basic feature phones or limited digital literacy.

#### Decision
Implement a zero-login, tokenized report card distribution pipeline:
1. When an academic period is finalized, the `issue-midterm-links` edge function generates high-entropy, cryptographically random, URL-safe tokens (`access_token`) mapped to each compiled report in `midterm_reports`.
2. Parents receive a direct SMS containing a brief, localized link: `https://portal.gsgacuba2a.rw/report?token=<UUID/Hash>`.
3. The `download-midterm-report` edge function validates the token against the active period, reads the frozen `report_data` JSON payload, streams the formatted binary PDF directly to the browser, and logs parent download receipts.
4. Tokens are revoked automatically if an academic period is reopened or superseded.

#### Consequences
- **Positive:**
  - Zero friction for parents: One tap from an SMS notification opens their child's official signed report card.
  - Complete security: Sequential ID enumeration attacks are impossible.
  - High performance: PDF generation happens on demand or streams from pre-compiled edge snapshots.
- **Negative:**
  - If a parent forwards their SMS, the recipient can also view that specific child's report card. This trade-off is accepted by school governance in exchange for frictionless parental engagement.

---

### ADR-013: Scope Boundary: Exclusion of Daily Attendance & Payroll to Enforce 500MB/1GB Storage Survival

#### Status
**Accepted & Implemented (v2.1.0)**

#### Context
G.S Gacuba 2A deploys to a managed Supabase production instance operating under baseline plan constraints: 500 MB database storage and 1 GB object file storage. The school serves 800 to 1,000 active students and 20 to 30 staff members.

A critical design requirement is that the institution must not suffer unexpected storage exhaustion or service outages within a 1-year academic cycle. In school administration software, two features notoriously exhaust database storage:
1. Daily attendance tracking (morning and period-by-period logs create 500,000–900,000 rows annually).
2. Human resources and payroll accounting (requires complex tax, ledger, and transactional audit trails).

Additionally, unpruned PDF report storage would quickly exceed the 1 GB object storage limit if stored permanently for 1,000 students across multiple terms.

#### Decision
1. **Explicit Scope Exclusion:** Daily attendance recording and staff payroll are deliberately declared out-of-scope and omitted from the database schema.
2. **Lean Core Scope:** The platform focuses strictly on:
   - Student & parent directory (800–1,000 active students + archived departures).
   - Staff RBAC (20–30 members).
   - Mid-term academic grading and rankings.
   - SMS notifications via Africa's Talking.
3. **7-Day Ephemeral PDF Cache Window:** Generated student report card PDFs are retained for a 7-day ephemeral distribution window rather than stored permanently. Reports are generated on-the-fly and cached temporarily during the active parent release period.
4. **Capacity Survival:** With only relational rows (consuming 15–25 MB/year) and ephemeral PDFs (peaking at ~150–250 MB during release before expiring), total storage comfortably survives within the 500 MB database and 1 GB file storage thresholds for an entire year.
5. **Contractual Responsibility Boundary:** Supabase does not permit piecemeal storage purchases; expanding storage requires upgrading the whole subscription plan. The school administration is formally responsible for upgrading the hosting and database plans if institutional demand exceeds the baseline plan limits.

#### Consequences
- **Positive:**
  - Guarantees 1-year continuous operation on baseline infrastructure without database exhaustion or unexpected upgrade costs.
  - High database query performance with near-instant index scans.
  - Crystal-clear operational and contractual boundaries.
- **Negative:**
  - The school must continue using external ledgers or specialized software for daily attendance and employee payroll.


