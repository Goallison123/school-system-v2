# Groupe Scolaire Gacuba 2A — Administrative Portal (v2.1.0)


An enterprise-grade, integrated school administration platform and academic operations system engineered specifically for **Groupe Scolaire Gacuba 2A** (Rubavu District, Gisenyi, Western Province, Rwanda).

The portal unites student lifecycle management, Rwanda Education Board (REB) mid-term grading, automated digital report card compilation, telecommunications gateway integration (Africa's Talking SMS), public CMS content management, and admissions inquiry triage within a single, high-performance Single Page Application (SPA).

---

## 1. System Architecture & Topology

The platform is designed around a **Client-Centric, Backend-as-a-Service (BaaS)** architecture. The frontend communicates directly with Supabase managed services (PostgreSQL 15 with Row-Level Security, PostgREST API, Auth, and Storage) alongside serverless Deno Edge Functions for asynchronous and cryptographic operations.

```
                      +---------------------------------------+
                      |        Browser Client (React SPA)     |
                      |   Vite + React 18 + Tailwind + jsPDF  |
                      +-------------------+-------------------+
                                          |
                        HTTPS / TLS 1.3   |  Bearer JWT (Supabase Auth)
                                          v
+---------------------------------------------------------------------------------+
|                                Supabase Platform                                |
|                                                                                 |
|  +--------------------+   +-----------------------+   +----------------------+  |
|  |    PostgREST API   |   |   PostgreSQL 15 RDBMS |   |     Auth Engine      |  |
|  |  Direct CRUD & RPC |<->|  - Row-Level Security |<->|  - GoTrue Service    |  |
|  |  Stored Procedures |   |  - Audit Triggers     |   |  - Session Tokens    |  |
|  +--------------------+   |  - Stored Procedures  |   +----------------------+  |
|                           +-----------+-----------+                             |
|                                       |                                         |
|  +------------------------------------+--------------------------------------+  |
|  |                         Deno Edge Functions                               |  |
|  |  +----------------------------+      +---------------------------------+  |  |
|  |  |  issue-midterm-links       |      |  download-midterm-report        |  |  |
|  |  |  (HMAC/Token Generation)   |      |  (Tokenized PDF delivery)       |  |  |
|  |  +----------------------------+      +---------------------------------+  |  |
|  |  +----------------------------+      +---------------------------------+  |  |
|  |  |  send-sms                  |      |  deliver-midterm-parent-notif   |  |  |
|  |  |  (Africa's Talking Proxy)  |      |  (Batch dispatch orchestrator)  |  |  |
|  |  +----------------------------+      +---------------------------------+  |  |
+---------------------------------------+-----------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
  +------------------------------+             +-------------------------------+
  |   Africa's Talking Gateway   |             |   Public School Website &     |
  |  - Rwandan Telco Carriers    |             |   Admissions Inquiries Desk   |
  |  - MTN Rwanda & Airtel SMS   |             |   - Content Synchronization   |
  +------------------------------+             +-------------------------------+
```

### Key Architectural Tenets

1. **Zero-Trust Row-Level Security (RLS):** All data access rules are enforced directly at the PostgreSQL layer. Client queries cannot circumvent business permissions even if the frontend bundle is reverse-engineered.
2. **Dual-Mode Persistence & Zero-Config Resilience:** Built with an active in-memory and local-state fallback layer. If cloud credentials (`VITE_SUPABASE_URL`) are omitted or unreachable, the system executes seamlessly in offline/mock mode with pre-seeded test fixtures, guaranteeing zero crashes during local demonstration, offline drills, or integration testing.
3. **Decoupled Academic Snapshots:** When an academic period is finalized, parent contact information and grade calculations are frozen into snapshot records (`midterm_reports` and `midterm_report_contacts`), preserving historic integrity against subsequent student migrations.
4. **Bandwidth-Optimized PDF Delivery:** Report cards are generated client-side using `jspdf` and `jspdf-autotable` with high-resolution school emblems, reducing server load and bandwidth consumption over local cellular connections.

---

## 2. System Scope: Included vs. Excluded Boundaries

To ensure complete clarity between institutional stakeholders, developers, and administrators, the system explicitly defines what is implemented versus what is deliberately excluded from scope.

```
+-----------------------------------------------------------------------------------------+
|                                    PLATFORM SCOPE MATRIX                                |
+-------------------------------------------------------------+---------------------------+
| INCLUDED IN PLATFORM (Active or Planned Baseline)           | EXCLUDED FROM SCOPE       |
+-------------------------------------------------------------+---------------------------+
| [x] Student & Guardian Directory (800-1,000 active students)| [ ] Daily Attendance      |
| [x] Role-Based Access Control (20-30 staff members)         | [ ] Staff Payroll & HR    |
| [x] Mid-Term Marks Recording & Automatic Gradebook          | [ ] Non-Midterm Term Exams|
| [x] 7-Day Ephemeral PDF Report Card Generation              | [ ] Multi-Term Transcripts|
| [x] SMS Notifications (Fees Alerts, Announcements, Reports) | [ ] Disciplinary Logs     |
| [x] Student Archival & Soft-Deletion History                | [ ] Timetable Scheduling  |
| [x] Public CMS (Hero, News, Gallery) & Inquiries Desk       | [ ] Inventory Management  |
+-------------------------------------------------------------+---------------------------+
```

### 2.1 Strictly Included in Platform Scope
- **Student & Parent Contact Directory:** Tracking active enrollment for **800 to 1,000 students per academic year**, including contact phone numbers (+250 format), tuition payment status, class streams, and soft-deleted archived student records.
- **Staff Workspaces & Role-Based Access Control (RBAC):** Supporting **20 to 30 staff members** across the four verified roles (`headteacher`, `dean_of_studies`, `teacher`, `it`) with strict partitioned data visibility.
- **Mid-Term Academic Engine:** Subject allocation, marks recording, automatic average and ranking calculations, and Dean approval workflows.
- **7-Day Ephemeral PDF Report Card Generation:** Client and edge generation of official bilingual report cards with a **strict 7-day retention/expiry window** to prevent permanent storage bloat.
- **SMS Communications:** Bulk and targeted SMS messaging via Africa's Talking for:
  - School fees reminders and payment balance notifications.
  - General administrative announcements and parent assembly summons.
  - Direct secure mid-term report card download links.
- **Public CMS & Inquiries Desk:** Basic content publishing (news, announcements, photo gallery) and visitor admissions inquiries management.

### 2.2 Explicitly Excluded from Platform Scope (Design Decisions)
- **Daily Attendance Tracking:** **Excluded.** The platform does *not* record daily morning or lesson-by-lesson attendance. Omitting daily attendance eliminates tens of thousands of volatile database rows per term, ensuring the database remains lightweight and fast.
- **Staff Payroll & Human Resources:** **Excluded.** Staff salaries, contracts, deductions, and payroll accounting are handled outside this portal.
- **Comprehensive Terminal Exam Warehousing & Multi-Term Transcripts:** **Excluded.** The platform focuses on immediate, high-fidelity mid-term assessment compilation and rapid parent report delivery.

---

## 3. Production Infrastructure, Capacity Planning & Upgrades

### 3.1 Can We Use Supabase for Production?
**Yes.** The platform is specifically architected to run in production on Supabase's baseline tier, which provisions:
- **500 MB** PostgreSQL Relational Database Storage
- **1 GB** File / Object Storage

### 3.2 Capacity Sizing & 1-Year Survival Calculations
A data volume audit confirms the platform will operate smoothly for an entire academic year within the baseline allowances:

1. **Student Population:** 800 to 1,000 active students per year (plus departed students preserved in `school_students_archive`).
2. **Staff Accounts:** 20 to 30 authorized staff members.
3. **Storage Consumers (Only Two Components Consume Storage):**
   - **Database Text Rows (PostgreSQL):** Student profiles, staff accounts, subject assignments, marks, and audit logs total roughly **15 to 25 MB per academic year** for 1,000 students. Even over multiple years of archiving, database storage will consume only a fraction of the 500 MB limit.
   - **PDF Report Card Files:** Individual PDF reports average ~150 KB. If reports were stored indefinitely, 1,000 students would consume ~150 MB per mid-term period. However, reports are engineered with an **ephemeral 7-day retention/cache window**. Reports exist only during the active parent release window and then expire or regenerate on demand, meaning active file storage peaks at ~150–250 MB and clears, staying well below the **1 GB** storage limit.
4. **Data Sizing Verdict:** The application comfortably survives for an entire academic year on the 500 MB database and 1 GB storage allocations.

### 3.3 Infrastructure Upgrades & Responsibility Clause
- **No Piecemeal Storage Upgrades:** Supabase does not permit purchasing standalone storage add-ons independently; capacity increases require upgrading the entire service subscription tier.
- **Institutional Responsibility:** The school administration is formally responsible for upgrading the hosting and database subscription plans if future institutional scale (e.g., student body exceeding 1,000, extended multi-year unpruned archives, or non-standard storage use) demands resources exceeding the baseline hosting and database service plans included with maintenance.

---

## 4. Core Functional Modules

### 4.1 Role-Based Portals & Access Control (RBAC)

The system enforces four distinct, strictly partitioned staff roles (as defined in `src/types.ts`, `src/App.tsx`, and PostgreSQL enum `public.school_role`):

- **Headteacher (`headteacher`):** Strategic executive visibility, institutional KPI dashboards, cross-stream academic standing, school fee collection metrics, and read-only academic audit.
- **Dean of Studies (`dean_of_studies`):** Academic operations: student enrollment and registration, roster CSV/Excel bulk import, curriculum subject configuration, teacher-to-class stream assignments, examination period creation and finalization, mark compilation, and report link distribution.
- **Teacher (`teacher`):** Classroom educator workspace: student roster viewing, subject mark entry, and student remarks strictly restricted to assigned secondary streams (`S1 A`–`S3 C`, `S4 ARH`–`S5 STREAM 2`, `S6 MPC`, `S6 HGL`).
- **IT Administrator (`it`):** Technical custody: staff user account provisioning, role changes, and system administration.

### 4.2 Student Information System (SIS)

- **Comprehensive Registry:** Tracks full names, Rwanda National Registry Codes, secondary class streams (`S1 A`, `S1 B`, `S1 C`, `S2 A`, `S2 B`, `S2 C`, `S3 A`, `S3 B`, `S3 C`, `S4 ARH`, `S4 STREAM 2`, `S5 ARH`, `S5 STREAM 2`, `S6 MPC`, `S6 HGL`), gender, tuition payment status (`Paid`, `Partial`, `Unpaid`), guardian contacts, and phone numbers (+250 format).
- **Intelligent Roster Ingestion:** Delimiter-sniffing CSV/Excel processor featuring fuzzy column header aliasing (e.g., mapping `"Parent Tel"`, `"Phone"`, `"Telephone"`, or `"Umubyeyi"` to `parent_phone`), pre-import duplicate validation, and preview modal.
- **Student Archive & Recovery:** Deleting a student initiates an archival transaction (`school_students_archive`) with mandatory audit reason logging, preventing accidental data loss and enabling one-click restoration.

### 4.3 Automated Mid-Term Academic Engine

- **Curriculum & Subject Configuration:** Granular subject toggles per class level with custom coefficient weightings conforming to Rwanda Education Board guidelines.
- **Gradebook Matrix:** Real-time spreadsheet-like mark entry with instant keyboard navigation, automatic average calculations, and letter grade conversion (`A`: 80-100%, `B`: 70-79%, `C`: 60-69%, `D`: 50-59%, `E`: <50%).
- **Period Lifecycle Management:** State transition workflows (`open` -> `locked` -> `finalized`). Finalizing executes server-side RPC functions that compile rankings, lock historical records, and generate cryptographically signed tokens.
- **Automated Digital Report Cards:** Produces official, bilingual (Kinyarwanda/French/English context) PDF report cards featuring official school emblems, teacher comments, conduct grades, class rank, and headmaster sign-off.

### 4.4 Multi-Channel Communication Hub

- **Africa's Talking SMS Gateway:** Integration with Rwanda's premier telecommunications API for direct parent notifications. Features automated phone sanitization (+250 country code normalization), carrier chunking, and credit balance monitoring.
- **Templating Engine:** Dynamic placeholder interpolation (`{parent_name}`, `{student_name}`, `{class_name}`, `{report_link}`, `{balance}`) with real-time character count and SMS segment calculation.
- **Ad-Hoc & Targeted Campaigns:** Broadcast messages filtered by class stream, tuition payment status, or custom criteria with audit tracking.

### 4.5 Institutional CMS & Admissions Desk

- **Public Website Content Management:** Centralized control over the school's public presence, including hero banners, news announcements, photo gallery curation, and faculty directories.
- **Admissions & Inquiries Desk:** Live capture and status tracking of prospective parent admissions requests, visitor queries, and general school correspondence.

---

## 5. Technology Stack

| Layer | Technologies | Justification |
|---|---|---|
| **Frontend Framework** | React 18.3, TypeScript 5.5, Vite 5.4 | High render efficiency, strict type contracts, instant HMR, zero runtime bloat. |
| **Styling & Design System** | Tailwind CSS 3.4, PostCSS, Lucide Icons | Institutional palette (`#4a2c19` Deep Brown, `#ea580c` Terracotta Orange, `#0284c7` Royal Blue) with responsive administrative desktop layout. |
| **Document Processing** | `jspdf` 4.2, `jspdf-autotable` 5.0, `xlsx` 0.18, `jszip` 3.10 | Zero-dependency client-side PDF synthesis and Excel spreadsheet parsing without server roundtrips. |
| **Backend & Storage** | Supabase, PostgreSQL 15, PostgREST 12 | Enterprise-tier relational engine with native RLS, ACID transactions, and automated REST endpoints. |
| **Serverless Runtime** | Deno (Supabase Edge Functions) | Edge-executed TypeScript functions with sub-100ms cold starts for SMS proxying and link generation. |
| **Telecommunications** | Africa's Talking REST API | Low-latency SMS delivery to MTN Rwanda and Airtel Rwanda subscriber networks. |

---

## 6. Database Architecture & Schema Overview

The database leverages PostgreSQL 15 with strict schemas, foreign keys, and indexes:

```sql
-- Core user profiles synchronized with Supabase Auth
public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text NOT NULL,
  role public.user_role DEFAULT 'teacher',
  created_at timestamptz DEFAULT now()
);

-- Primary student directory
public.school_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_code text UNIQUE,
  full_name text NOT NULL,
  class_name text NOT NULL,
  gender text CHECK (gender IN ('Male', 'Female')),
  parent_name text NOT NULL,
  phone text NOT NULL,
  email text,
  tuition_status text DEFAULT 'unpaid',
  created_at timestamptz DEFAULT now()
);

-- Historical archive for soft-deleted student records
public.school_students_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid NOT NULL,
  full_name text NOT NULL,
  class_name text NOT NULL,
  archive_reason text NOT NULL,
  archived_at timestamptz DEFAULT now(),
  archived_by uuid REFERENCES public.users(id)
);

-- Academic periods and grading
public.midterm_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  official_date date NOT NULL,
  status text CHECK (status IN ('open', 'locked', 'finalized')),
  created_by uuid REFERENCES public.users(id)
);

-- Consolidated compiled report cards
public.midterm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid REFERENCES public.midterm_periods(id),
  student_id uuid REFERENCES public.school_students(id),
  student_name text NOT NULL,
  class_name text NOT NULL,
  average numeric(5,2) NOT NULL,
  rank integer,
  report_data jsonb NOT NULL,
  access_token text UNIQUE,
  generated_at timestamptz DEFAULT now()
);
```

---

## 7. Getting Started & Development

### 7.1 Prerequisites

- **Node.js:** v18.18+ or v20+ LTS
- **Package Manager:** `npm` (v9+)
- **Supabase CLI:** (Optional for local migrations: `npm install -g supabase`)

### 7.2 Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Goallison123/school-system-v2.git
   cd school-system-v2
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Populate the following variables (or leave empty to use offline mock mode):
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
   VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."

   # Africa's Talking SMS Gateway
   VITE_AFRICASTALKING_USERNAME="sandbox"
   VITE_AFRICASTALKING_API_KEY="your_api_key"
   VITE_AFRICASTALKING_SENDER_ID="sandbox"
   VITE_AFRICASTALKING_ENV="sandbox"

   # School Email Configuration (Resend is called by Supabase, not the browser)
   VITE_EMAIL_PROVIDER="resend"
   VITE_EMAIL_FROM_NAME="G.S Gacuba 2A Administration"
   VITE_EMAIL_FROM_EMAIL="admin@gsgacuba2a.rw"
   ```

   Configure the following Supabase Edge Function secrets before using live email:
   ```bash
   supabase secrets set RESEND_API_KEY="re_..."
   supabase secrets set RESEND_FROM_EMAIL="admin@gacuba2a.co.rw"
   supabase secrets set RESEND_FROM_NAME="G.S Gacuba 2A Administration"
   ```
   Apply migrations and deploy the email proxy:
   ```bash
   supabase db push
   supabase functions deploy send-email
   ```

4. **Launch development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 8. Verification, Testing & Build Scripts

The repository provides comprehensive commands for linting, type-checking, testing, and production builds:

```bash
# Start Vite development server on port 3000
npm run dev

# Run TypeScript type-checker across the entire codebase
npm run typecheck

# Execute ESLint validation
npm run lint

# Run unit and integration tests (Vitest)
npm run test

# Compile production-ready distribution bundle into dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 9. Edge Functions & Microservices

The application contains production Deno serverless edge functions located in `/supabase/functions`:

| Function Name | Runtime | Role & Purpose |
|---|---|---|
| `issue-midterm-links` | Deno / TypeScript | Generates cryptographic, URL-safe access tokens for student reports, enabling secure parent access without creating parent user accounts. |
| `download-midterm-report` | Deno / TypeScript | Validates parent access tokens, queries snapshot report JSON, and streams dynamic PDF binary directly to the browser. |
| `finalize-midterm` | Deno / TypeScript | Atomic transaction orchestrator: transitions period state to `finalized`, computes class rankings, and locks marks against tampering. |
| `send-sms` | Deno / TypeScript | Secure proxy isolating Africa's Talking API secrets from client bundles; formats Rwanda numbers and routes via outbound REST. |
| `send-email` | Deno / TypeScript | Authenticated Resend proxy; stores one provider result per recipient in `email_dispatches`. |
| `deliver-midterm-parent-notifications` | Deno / TypeScript | High-throughput batch worker dispatching SMS and email links to parent rosters upon academic period release. |
| `send-midterm-reminders` | Deno / TypeScript | Scheduled worker alerting teachers and administrators regarding missing subject mark entries prior to deadlines. |

To deploy edge functions using Supabase CLI:
```bash
supabase functions deploy issue-midterm-links
supabase functions deploy download-midterm-report
supabase functions deploy send-sms
```

---

## 10. Repository Structure

```
├── docs/                                  # Technical specifications & design docs
│   ├── README.md                          # Documentation index & architecture map
│   ├── PRD_SRS.md                         # Product Requirements & System Specs
│   ├── SOFTWARE_DESIGN_DOCUMENT.md        # Detailed Software Architecture & ERDs
│   ├── ARCHITECTURE_DECISION_RECORDS.md   # Architectural Decision Records (ADRs)
│   ├── API_INTEGRATION_SPECIFICATIONS.md  # PostgREST, RPC & Edge Function API Specs
│   ├── UI_UX_DESIGN_DOCUMENTATION.md      # UI design tokens, wireframes & user flows
│   └── DEVELOPMENT_ONBOARDING_GUIDELINES.md # Engineering standards & git runbooks
├── public/                                # Static web assets & school emblems
│   └── assets/school-community.jpg        # School community visual asset
├── src/
│   ├── components/                        # Modular React UI components
│   │   ├── modals/                        # Dialogs (AddContact, Content, Import, etc.)
│   │   └── ui/                            # Atomic primitives (Button, Avatar, etc.)
│   ├── layout/                            # Layout chrome and maintenance banners
│   ├── lib/                               # Core libraries (Supabase client, constants)
│   ├── pages/                             # Route view controllers
│   │   ├── Overview.tsx                   # Master Executive Dashboard
│   │   ├── HeadmasterOverview.tsx         # Headmaster strategic KPI view
│   │   ├── TeacherOverview.tsx            # Teacher workspace & class streams
│   │   ├── TeacherStudentRegister.tsx     # Student class roster register
│   │   ├── Students.tsx                   # SIS Student & Parent Directory
│   │   ├── MidTermEngine.tsx              # Mid-Term academic grading engine
│   │   ├── Campaigns.tsx                  # SMS & Email messaging campaigns
│   │   ├── Contacts.tsx                   # Guardian contact directory
│   │   ├── ContentManager.tsx             # Public landing page CMS
│   │   ├── Inquiries.tsx                  # Admissions inquiries desk
│   │   ├── UserManagement.tsx             # RBAC user provisioning
│   │   └── ReportNotFound.tsx             # Public report card token lookup
│   ├── services/                          # External integration services
│   │   ├── africasTalkingService.ts       # Africa's Talking SMS API integration
│   │   ├── automationService.ts           # Background trigger automation
│   │   └── emailService.ts                # Email notification dispatcher
│   ├── utils/                             # Academic math, CSV parsing & helpers
│   │   ├── midterm.ts                     # REB grading curves & average calculations
│   │   └── studentCsv.ts                  # Delimiter-sniffing CSV/Excel processor
│   ├── App.tsx                            # Root application & authentication router
│   ├── index.css                          # Tailwind CSS base and theme rules
│   └── main.tsx                           # Application DOM entry point
├── supabase/
│   ├── functions/                         # Deno Serverless Edge Functions
│   └── migrations/                        # Version-controlled PostgreSQL SQL migrations
├── package.json                           # Dependency definitions and npm scripts
├── tailwind.config.js                     # Tailwind typography and theme configuration
├── tsconfig.json                          # TypeScript compiler settings
└── vite.config.ts                         # Vite build and dev server configuration
```

---

## 11. Security, Governance & Compliance

- **No Hardcoded Secrets:** All secret keys (`SUPABASE_SERVICE_ROLE_KEY`, `AFRICASTALKING_API_KEY`) reside exclusively within server-side Edge Function environment variables. The client bundle exposes only the public anonymous key.
- **Data Protection & Privacy:** Student contact records are protected behind PostgreSQL RLS policies ensuring that teachers only access students in their assigned class streams, while financial tuition records are restricted to administrative accounts.
- **Parent Access Security:** Public report card links use unguessable, high-entropy tokens rather than sequential IDs (`/report?token=xyz...`), preventing unauthorized enumeration of academic data.

---

## 12. Authors & Acknowledgments

- **Institution:** Groupe Scolaire Gacuba 2A, Rubavu District, Western Province, Rwanda.
- **Development & Architecture:** Sybella Systems Ltd.
- **Version:** 2.1.0 (Released October 2026)
