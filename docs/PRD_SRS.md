# Product Requirements Document (PRD) & Software Requirements Specification (SRS)
## G.S Gacuba 2A Admin Portal & School Management System

- **Product Name:** G.S Gacuba 2A Integrated School Administration Portal
- **Target Organization:** Groupe Scolaire Gacuba 2A (Gisenyi, Rubavu District, Western Province, Rwanda)
- **Document Version:** 2.0.0
- **Status:** Approved / Active Production Baseline
- **Classification:** Internal School System Documentation

---

## 1. Executive Summary & Product Vision

### 1.1 Purpose
The **G.S Gacuba 2A Admin Portal** is an enterprise-grade school management platform engineered specifically for the administrative, pedagogical, and communication requirements of Groupe Scolaire Gacuba 2A. The institution operates Secondary education sections under the academic framework of the **Rwanda Education Board (REB)**.

The platform provides a centralized, secure, multi-role operating environment for:
1. **Student Records & Enrollment Lifecycle:** Managing learner profiles, class streams, parent/guardian contact credentials, and school fee payment ledgers.
2. **Mid-Term assessments & Academic Engine:** Administering class subject allocations, teacher class assignments, assessment mark entries, automatic report card compilation, Rwanda national curriculum grading, and Dean of Studies verification.
3. **Automated Document & PDF Pipeline:** Compiling verifiable, print-ready PDF academic report cards with dynamic grade breakdowns and automatic seven-day storage cache invalidation.
4. **Targeted Multi-Channel Communications:** Dispatching deduplicated, personalized SMS and email notifications to parents regarding tuition fees, academic progress, PTA assemblies, and official examination schedules (if needed and paid for).
5. **Public-Facing Content Management (CMS):** Publishing curated news, announcements, and cultural/facilities galleries to the public school website.
6. **Admissions & Visitor Desk:** Triage of prospective parent admissions inquiries with a direct 1-click registration bridge to the student registry.

### 1.2 Core Business Objectives
- **Zero Loss of Academic Records:** Eliminate manual paper mark ledgers and ad-hoc spreadsheets through an authoritative PostgreSQL database backed by strict Row-Level Security (RLS).
- **Sub-Second Report Generation:** Automate compilation of student mid-term performance cards immediately upon teacher mark completion.
- **Privacy Enforcement:** Shield parent telephone numbers and email addresses from classroom teachers while maintaining full transparent visibility for the Headteacher and Dean of Studies.
- **Financial Traceability:** Provide instant visibility over school fee collection rates (`Paid`, `Partial`, `Unpaid`) across every class stream.
- **Duplicate Dispatch Prevention:** Guarantee through cryptographic fingerprinting that duplicate SMS campaigns or notifications are never accidentally sent to guardians.

---

## 2. User Personas & Access Control Tiers

The system enforces strict role-based access control (RBAC). A user's role is governed by the `public.users` table in PostgreSQL, verified via the `current_school_role()` database function.

### Persona 1: Dean of Studies (`dean_of_studies`)
- **Profile:** Head of academic affairs and curriculum compliance.
- **Key Responsibilities:**
  - Configures subject matrices for all streams (`S1 A` through `S6 MPC / HGL`).
  - Assigns teachers to class subjects using unique teacher UUID identifiers.
  - Sets the official mid-term examination dates and grading deadlines.
  - Reviews, approves, overrides, or forces regeneration of student academic reports.
  - Manages student registry CRUD operations, including bulk CSV imports.
  - Initiates and previews mid-term parent SMS dispatches.
- **Permissions:** Full read/write access to students, subjects, mark reviews, reports, SMS ledgers, assignments, and calendar events.

### Persona 2: Headteacher (`headteacher`)
- **Profile:** Chief institutional executive and administrative leader.
- **Key Responsibilities:**
  - Monitors high-level institutional metrics: student headcounts, fee compliance, messages delivered, and web publication rates.
  - Accesses final, approved mid-term reports and downloads official PDF report cards.
  - Authorizes fee reminder notifications and general school-wide announcements.
  - Reviews prospective admissions inquiries and institutional outreach.
- **Permissions:** Read-only access to academic marks and student registries; read/write access to general notification campaigns and content. No direct access to raw mid-term SMS dispatch tables.

### Persona 3: Classroom Teacher (`teacher`)
- **Profile:** Academic educator responsible for specific classes and subjects.
- **Key Responsibilities:**
  - Inspects the assigned classroom student roster (student names and streams only).
  - Inputs, reviews, and updates assessment marks (0 to 100) for assigned students.
  - Locks marks once an official report card has been compiled.
  - Downloads PDF report cards for pupils in assigned classes.
- **Permissions:** Strictly restricted by database RLS to classes assigned via `public.teacher_class_assignments`. Denied access to parent contact numbers, emails, financial records, or other classes.

### Persona 4: IT Administrator (`it`)
- **Profile:** Technical custodian and systems administrator.
- **Key Responsibilities:**
  - Manages staff onboarding and provisions user roles (`dean_of_studies`, `headteacher`, `teacher`, `it`).
- **Permissions:** Superuser privileges across user management, system tables, and technical logs.

### Persona 5: Prospective Parent / Visitor (Public)
- **Profile:** Guardian inquiring about school programs, admissions, or transport.
- **Key Responsibilities:** Submits admissions inquiries through the public portal contact form.

---

## 3. Functional Modules & Requirements Specification

### Module 1: Student Registry & student Management

#### 1.1 Manual student Registration
- **FR-1.1.1:** The system shall allow authorized users (`dean_of_studies`, `it`) to manually register an individual student.
- **FR-1.1.2:** Mandatory registration fields:
  - `fullName` (String, minimum 2 tokens: first name and surname)
  - `registration_number` (String, unique alphanumeric institution ID, e.g., `REG-2026-001` or `STU-101` but we are preferabbly using `GSC-XXXXX`)
  - `studentClass` (Enum: `S1 A`, `S1 B`, `S2 A`, `S2 B`, `S3 A`, `S4 ARH`, `P5 ARH`, `P6 HGL`, `S6 MPC`, etc.)
  - `stream` (String, e.g., `General or O' level`, `Sciences`, `Humanities`)
  - `parentName` (String, mandatory, cannot be "not provided")
  - `email` (Valid RFC 5322 email string)
  - `phone` (E.164 compliant or international format with at least 8 normalized digits)
  - `feeStatus` (Enum: `Paid`, `Partial`, `Unpaid`)
  - `feeAmount` (String representing currency and value, e.g., `24,000 RWF`)
- **FR-1.1.3:** The system shall automatically record `created_at`, `updated_at`, and set the initial record status.

#### 1.2 Bulk CSV Data Ingestion & Auto-Mapping
- **FR-1.2.1:** The system shall support CSV and TSV file uploads up to 10MB containing student rosters.
- **FR-1.2.2:** The CSV parser shall auto-detect delimiters (comma `,`, semicolon `;`, tab `\t`) and strip UTF-8 BOM headers.
- **FR-1.2.3:** The parser shall automatically map headers against synonym aliases:
  - First Name: `firstname`, `studentfirstname`, `givenname`, `forename`
  - Last Name: `lastname`, `studentlastname`, `surname`
  - Full Name: `fullname`, `studentname`, `learnername`, `pupilname`
  - Registration Number: `registrationnumber`, `regno`, `regnumber`, `studentid`
  - Guardian: `parentname`, `guardianname`, `guardian`, `contactname`
  - Class: `class`, `classname`, `grade`, `level`
  - Stream: `stream`, `studentstream`, `section`
  - Phone: `phone`, `telephone`, `mobile`, `parentphone`
  - Email: `email`, `parentemail`, `guardianemail`
- **FR-1.2.4:** The parser shall validate every row and present an interactive staging grid displaying validated records, row errors, and duplicate flags before committing.
- **FR-1.2.5:** Duplicate records matching existing normalized name and class combinations shall be flagged and excluded from insertion.

#### 1.3 Interactive Slide-Over Drawer & Search
- **FR-1.3.1:** The client shall provide a slide-over drawer allowing instant inspection and editing of student metadata, fee records, and guardian contacts.
- **FR-1.3.2:** Real-time client filtering shall support multi-parameter queries across student name, registration number, class, guardian name, email, phone, and fee status.

---

### Module 2: Mid-Term Academic Assessment Engine

#### 2.1 Subject Matrix & Teacher Class Assignment
- **FR-2.1.1:** The Dean of Studies shall configure class subjects (`public.midterm_subjects`) with toggleable active states (`is_enabled`).
- **FR-2.1.2:** Teachers shall be associated with specific classes via `public.teacher_class_assignments`.
- **FR-2.1.3:** Database RLS shall strictly limit teachers to viewing and entering marks only for classes to which they are explicitly assigned.

#### 2.2 Mark Recording & Validation
- **FR-2.2.1:** Marks shall be entered on a 0 to 100 numerical scale.
- **FR-2.2.2:** A mark of `0` is a valid entered assessment mark indicating zero score.
- **FR-2.2.3:** Teachers cannot alter marks for a pupil once an official report card has been compiled, unless unlocked by the Dean of Studies.

#### 2.3 Grading Rules & Report Compilation
- **FR-2.3.1:** Grading follows Rwanda Education Board (REB) (Weight is not confirmed to be the real ones, no official documentation found) standards:
  - 80.0% – 100.0%: **Grade A** (Weight: 10 – 8)
  - 70.0% – 79.9%: **Grade B** (Weight: 7)
  - 60.0% – 69.9%: **Grade C** (Weight: 6)
  - 50.0% – 59.9%: **Grade D** (Weight: 5)
  - 0.0% – 49.9%: **Grade E** (Weight: 4 – 0)
- **FR-2.3.2:** Subjects with zero marks (`0`) or disabled status (`is_enabled = false`) shall be excluded from student average calculations and report subject rows.
- **FR-2.3.3:** When all enabled class subjects have a recorded mark for a pupil, a PostgreSQL trigger (`auto_compile_midterm_on_mark_save`) shall automatically compile a new report card snapshot if marks have changed.
- **FR-2.3.4:** The report record (`public.midterm_reports`) stores: student identity snapshot, period, computed average, subject array with grades and weights, and review status (`pending` or `approved`).
- **FR-2.3.5:** Concurrently, parent contact details (`parent_name`, `phone`, `email`) are snapshotted into `public.midterm_report_contacts` to decouple contact auditing from teacher queries.

#### 2.4 Dean Review & Approval
- **FR-2.4.1:** The Dean of Studies can review pending reports, edit subject marks, input official administrative comments, approve reports, delete anomalous reports, or trigger single-student / batch force-regenerations.

---

### Module 3: Report Card PDF Generation & Document Storage

- **FR-3.1:** The system shall generate official A4 academic report cards in PDF format using `jspdf` and `jspdf-autotable`.
- **FR-3.2:** The PDF must include:
  - Institutional header: "GROUPE SCOLAIRE GACUBA 2A", District, Academic Period.
  - Learner demographics: student name, Registration code, Class, Stream.
  - Tabular academic assessment breakdown: Subject, Mark (/100), REB Grade, Weight.
  - Overall summary: Class average, Total enabled subjects evaluated, Official Dean remarks.
  - Verification signature block and institutional stamp placeholder.
- **FR-3.3:** Generated PDFs shall be uploaded to the private Supabase Storage bucket `midterm-reports`.
- **FR-3.4 (7-Day Cache Policy):**
  - If a PDF object exists in storage and is younger than 7 days (604,800 seconds), the system returns the existing file.
  - If the PDF does not exist or was generated more than 7 days ago, the system regenerates the document, replaces the object in storage, and updates `pdf_generated_at`.

---

### Module 4: Multi-Channel Parent Communications & SMS Dispatcher

- **FR-4.1:** The portal shall support drafting and dispatching communication campaigns across SMS, WhatsApp, and Email channels with SMS being the priority and email for updates for the platform users.
- **FR-4.2:** Communication categories: `Fee reminder`, `Parent notification`, `Examination result`, `General announcement`.
- **FR-4.3:** Dynamic template placeholders: `{FULLNAME}` (replaced with student full name), `{FEES}` (replaced with outstanding balance).
- **FR-4.4 (Cryptographic Deduplication):**
  - The system shall compute a unique dispatch fingerprint: `CATEGORY|NORMALIZED_MESSAGE|RECIPIENT_UUIDS_CSV`.
  - Dispatches with an existing fingerprint shall conflict on database unique constraints, preventing accidental duplicate SMS broadcasts.
- **FR-4.5:** The SMS composer shall present a scrollable recipient preview table showing phone validity status. Invalid numbers (<8 normalized digits) are flagged and automatically skipped.
- **FR-4.6:** Campaign records default to status `Draft` or `Scheduled` until confirmed by an active telecommunication gateway.

---

### Module 5: Landing Page CMS & Public Information Desk

- **FR-5.1:** Authoring and curation of News items and Gallery media items.
- **FR-5.2:** News articles support: Title, Category, Summary, Rich Content blocks (paragraphs), Author, Estimated read time, and Published timestamp.
- **FR-5.3:** Gallery items support: Title, Category (Facilities, Sports, Culture, Academics), Image URL / Storage Path, and Description.
- **FR-5.4:** Status lifecycle: Draft vs. Published. Only published items are accessible to unauthenticated public website visitors.

---

### Module 6: Visitor Inquiries & Admissions Desk

- **FR-6.1:** Captures external queries submitted via the school website contact form: Visitor Name, Email, Phone, Topic (Admissions, Fees, General, Transport), and Message.
- **FR-6.2:** Status lifecycle: `New` -> `In progress` -> `Resolved`.
- **FR-6.3 (Admissions Bridge):** Authorized staff can click "Register as Student" directly from an inquiry, which navigates to the Student Registry and pre-fills the registration modal with the parent's contact information.

---

### Module 7: Notification Outbox & Scheduled Resend Email Worker

- **FR-7.1:** Scheduling the official mid-term examination date inserts transactional event payloads into `public.midterm_notification_outbox`.
- **FR-7.2:** Outbox event types:
  - `teacher_midterm_date_set`: Alerting all teachers assigned to classes.
  - `dean_midterm_review`: Alerting the Dean of Studies when report compilation is pending.
- **FR-7.3:** A Supabase Deno Edge Function (`dispatch-midterm-emails`) executes periodically, querying undelivered outbox records (`delivered_at IS NULL`), delivering emails via the Resend API, and marking records with timestamps upon delivery.

---

## 4. User Stories with Gherkin Acceptance Criteria

### US-1: Automated Report Compilation on Mark Completion
> **As a** Dean of Studies,  
> **I want** the system to automatically compile an academic report card as soon as all enabled class subjects have a mark for a student,  
> **So that** I don't have to manually reconcile spreadsheets and calculate averages.

```gherkin
Scenario: Automatic report compilation upon final subject mark
  Given Pupil "Ineza Divine" is enrolled in class "S2 A"
  And class "S2 A" has 3 enabled subjects: "Mathematics", "English", "Kinyarwanda"
  And "Ineza Divine" currently has marks for "Mathematics" (85) and "English" (78)
  When the teacher enters a mark of "90" for "Kinyarwanda"
  Then the database trigger "auto_compile_midterm_on_mark_save" executes
  And a new row is created in "public.midterm_reports" for "Ineza Divine"
  And the computed average is "84.33"
  And the report status is set to "pending"
  And parent contact details are snapshotted in "public.midterm_report_contacts"
```

### US-2: Teacher Role Privacy Isolation
> **As a** Classroom Teacher,  
> **I want** to see only the names and classes of students in my assigned streams,  
> **So that** student financial status and parent personal contact details remain confidential.

```gherkin
Scenario: Teacher queries student registry
  Given Teacher "Jean Pierre" is authenticated with role "teacher"
  And Teacher "Jean Pierre" is assigned to class "S4 ARH" only
  When the teacher navigates to the student register
  Then the system displays the "teacher_student_register" security barrier view
  And the teacher sees only students enrolled in "S4 ARH"
  And the student view omits parent name, phone number, email, fee status, and fee balance
  And direct SQL queries to "public.school_students" are rejected with an RLS permission denied error
```

### US-3: Deduplicated SMS Campaign Broadcast
> **As a** School Administrator,  
> **I want** the platform to detect duplicate SMS broadcasts,  
> **So that** parents do not receive duplicate text messages and the school avoids unnecessary SMS costs.

```gherkin
Scenario: Submitting an identical SMS campaign batch
  Given a fee reminder SMS was dispatched to 15 parents in class "S1 A" with message "Please settle term fees"
  And a dispatch fingerprint was recorded in "public.sms_campaign_dispatches"
  When an administrator accidentally clicks "Send SMS" with the exact same message and recipient list
  Then the system detects the identical cryptographic fingerprint
  And the database aborts the transaction with an ON CONFLICT DO UPDATE constraint
  And the UI notifies the administrator that this exact batch was already queued
```

### US-4: 7-Day Cached PDF Report Generation
> **As a** Headteacher,  
> **I want** PDF report cards to download instantly from cache when valid,  
> **So that** batch printing does not overload server resources.

```gherkin
Scenario: Reusing cached report card PDF
  Given an approved report card for student "Habimana Eric" generated 3 days ago
  And the PDF exists in the "midterm-reports" Supabase Storage bucket
  When the Headteacher clicks "Download PDF"
  Then the system serves the existing stored PDF object directly
  And no PDF re-compilation occurs
  
Scenario: Regenerating expired report card PDF
  Given an approved report card generated 9 days ago
  When the Headteacher clicks "Download PDF"
  Then the system detects the cache timestamp exceeds 7 days
  And the system regenerates the PDF with current institutional metadata
  And replaces the object in the "midterm-reports" bucket
  And updates "pdf_generated_at" to the current timestamp
```

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance Targets
- **NFR-1 (UI Responsiveness):** Dashboard and registry queries shall achieve First Contentful Paint (FCP) in <1.2 seconds on standard 3G/4G connections.
- **NFR-2 (Search Latency):** Client-side filter queries over rosters of up to 5,000 students shall return results in <50 milliseconds.
- **NFR-3 (Report Generation):** Database-triggered compilation of an individual report card shall execute in <150 milliseconds. Batch generation of 100 reports shall complete in <8 seconds.
- **NFR-4 (PDF Compilation):** Client-side jsPDF rendering and buffer upload to Supabase Storage shall complete in <1.8 seconds per report.

### 5.2 Security & Data Protection
- **NFR-5 (Database-Enforced Security):** All access restrictions must be enforced by PostgreSQL Row-Level Security (RLS) policies. Front-end routing checks are considered UX conveniences, not security boundaries.
- **NFR-6 (Role Source of Truth):** User roles are determined exclusively by `public.users.role`, checked via `SECURITY DEFINER` function `current_school_role()`. Client-side JWT tampering cannot grant elevated roles.
- **NFR-7 (Audit Trail):** Every mark modification, report generation, and status change records the responsible user's UUID and timestamp.
- **NFR-8 (Credential Protection):** Service role keys and external gateway API keys (`RESEND_API_KEY`) must never be bundled into client-side JavaScript.

### 5.3 Reliability, Scalability & Offline Grace
- **NFR-9 (Client Mock Fallback):** In offline or local development scenarios without an active Supabase backend, the application must gracefully activate its in-memory/localStorage mock client, ensuring zero crash states.
- **NFR-10 (CSV Error Isolation):** Parsing a CSV file with malformed rows shall not crash the import engine. Invalid rows must be isolated with human-readable error explanations while valid rows remain importable.
- **NFR-11 (Email Outbox Durability):** Outbox records must remain persisted in `public.midterm_notification_outbox` until an HTTP 200 response is received from the Resend gateway.
