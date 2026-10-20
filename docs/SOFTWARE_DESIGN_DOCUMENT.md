# Software Design Document (SDD)
## G.S Gacuba 2A Integrated School Administration Portal

- **Document Version:** 2.0.0
- **Status:** Architectural Baseline
- **System Classification:** Web-based Enterprise Academic Management System (SPA + BaaS)

---

## 1. System Architecture & Topology

### 1.1 Architectural Style
The application utilizes a decoupled Single Page Application (SPA) frontend built on **React 18**, **TypeScript**, and **Vite**, communicating directly over HTTPS/WSS with a **Supabase (PostgreSQL 15)** Backend-as-a-Service (BaaS) and serverless **Deno Edge Functions**.

All business security constraints, permission scopes, and data integrity rules are enforced directly within PostgreSQL through **Row-Level Security (RLS)**, `CHECK` constraints, unique indexes, and PL/pgSQL database triggers.

```
+-----------------------------------------------------------------------------------+
|                            CLIENT TIER (Browser Runtime)                          |
|                                                                                   |
|  +--------------------+  +-----------------------+  +--------------------------+  |
|  | React 18 / Vite SPA|  | Tailwind CSS 3.4      |  | jsPDF Report Generator   |  |
|  | React Router DOM v6|  | Lucide / Font Awesome |  | LocalStorage Mock Fallback|  |
|  +---------+----------+  +-----------+-----------+  +------------+-------------+  |
+------------|-------------------------|---------------------------|----------------+
             |                         |                           |
             | HTTPS / WSS             | HTTPS                     | HTTPS
             v                         v                           v
+-----------------------------------------------------------------------------------+
|                            SUPABASE PLATFORM CLOUD TIER                           |
|                                                                                   |
|  +-----------------------------+       +---------------------------------------+  |
|  | PostgREST API Engine        |       | Supabase Auth Service                 |  |
|  | (Auto-mapped REST endpoints)|       | (JWT Issue, Session verification)     |  |
|  +--------------+--------------+       +-------------------+-------------------+  |
|                 |                                          |                      |
|                 v                                          v                      |
|  +-----------------------------------------------------------------------------+  |
|  |                       PostgreSQL 15 Relational Core                         |  |
|  |                                                                             |  |
|  |  +-----------------------+  +--------------------+  +--------------------+  |  |
|  |  | Row-Level Security    |  | Triggers & Stored  |  | Security Barrier   |  |  |
|  |  | (RLS Role Policies)   |  | Procedures (PLpgSQL)| | Views (Teacher Reg) |  |  |
|  |  +-----------------------+  +--------------------+  +--------------------+  |  |
|  +--------------+------------------------------------------+-------------------+  |
|                 |                                          |                      |
|                 v                                          v                      |
|  +-----------------------------+       +---------------------------------------+  |
|  | Supabase Storage            |       | Deno Edge Functions Runtime           |  |
|  | (Bucket: 'midterm-reports') |       | ('dispatch-midterm-emails' worker)    |  |
|  +-----------------------------+       +-------------------+-------------------+  |
+------------------------------------------------------------|----------------------+
                                                             |
                                                             | HTTPS API
                                                             v
                                         +---------------------------------------+
                                         | External Services:                    |
                                         | Resend Email API / SMS Gateway Telcos |
                                         +---------------------------------------+
```

---

## 2. Frontend Component & Routing Architecture

### 2.1 Routing & Role-Aware Navigation
The single-page application router is managed in `src/App.tsx`. Authenticated routing evaluates the user's canonical role obtained from `public.users` on login:

```
                          [ Client Session Check ]
                                     |
               +---------------------+---------------------+
               | Unauthenticated                           | Authenticated
               v                                           v
       [ LoginScreen.tsx ]                        [ Role Evaluation ]
                                                           |
          +-------------------+----------------------------+-----------------------+
          |                   |                            |                       |
     role = 'teacher'   role = 'headteacher'        role = 'dean_of_studies'   role = 'it'
          |                   |                            |                       |
     Accessible:         Accessible:                  Accessible:             Accessible:
     - /overview         - /overview (Headteacher)     - /overview             - /overview
     - /midterm          - /midterm (Reports read)    - /students (Full CRUD) - /students
     - /students (View)  - /campaigns                 - /midterm (Full Engine)- /midterm
                                                      - /campaigns            - /users (Staff roles)
                                                      - /contacts             - /campaigns
                                                      - /content              - /contacts
                                                      - /inquiries            - /content
                                                                              - /inquiries
```

### 2.2 Component Hierarchy & Responsibilities

```
src/
├── App.tsx                          # App shell, navigation sidebar, topbar, route guards
├── main.tsx                         # Entry point rendering BrowserRouter and App
├── index.css                        # Tailwind directives, custom scrollbars, DM Sans/Inter typography
├── types.ts                         # System TypeScript interfaces (Contact, Campaign, Content, etc.)
├── components/
│   ├── LoginScreen.tsx              # Email/password authentication form with role resolution
│   ├── modals/
│   │   ├── AddContactModal.tsx      # Manual contact record addition modal
│   │   ├── ContentModal.tsx         # News/Gallery CMS item authoring modal
│   │   ├── HelpModal.tsx            # Staff onboarding and documentation modal
│   │   ├── ImportModal.tsx          # Contact CSV ingestion dialog
│   │   ├── NotificationModal.tsx    # SMS/Email multi-channel campaign composer
│   │   └── SettingsModal.tsx        # Institution profile and channel preference modal
│   └── ui/
│       ├── Avatar.tsx               # Initials-based avatar circles with role-colored borders
│       ├── Button.tsx               # Standardized primary/secondary button variants
│       └── IconButton.tsx           # Accessible icon action buttons
├── pages/
│   ├── HeadmasterOverview.tsx       # Role-specific school overview with live totals and tables
│   ├── TeacherOverview.tsx          # Teacher home with assigned classes and register links
│   ├── Overview.tsx                 # Standard overview workspace with category stats
│   ├── Students.tsx                 # Dean registry: manual CRUD, slide-over drawer, CSV import
│   ├── TeacherStudentRegister.tsx   # Teacher view: assigned class rosters, names & streams only
│   ├── MidTermEngine.tsx            # Academic assessment matrix, compilation, review & PDF export
│   ├── UserManagement.tsx           # IT-only role assignment and user permission management
│   ├── Campaigns.tsx                # SMS/Notification campaign history and dispatch queue
│   ├── Contacts.tsx                 # Parent directory with search and XLS/ODS export
│   ├── ContentManager.tsx           # Public web CMS: News publications and Gallery curation
│   └── Inquiries.tsx                # Admissions inquiries desk with status triage and enrollment bridge
└── utils/
    ├── helpers.ts                   # Date formatters, initials extractor, blob downloaders
    ├── midterm.ts                   # Pure grading rules (REB scale), average calculations, phone validation
    ├── midterm.test.ts              # Automated Vitest unit test suite
    └── studentCsv.ts                # Robust CSV parser, delimiter detector, alias matcher, row validator
```

---

## 3. Relational Data Models & Database Schemas

The database schema is defined across migrations in `supabase/migrations/`. Below is the complete entity-relationship specification.

### 3.1 Entity Relationship Diagram (ERD)

```
 +--------------------+       +------------------------------+
 |    auth.users      |       |  public.users                |
 |--------------------|       |------------------------------|
 | id (PK, UUID)      |<------| id (PK, FK -> auth.users.id) |
 | email              |       | email (TEXT, UNIQUE)         |
 +---------+----------+       | full_name (TEXT)             |
           |                  | role (school_role ENUM)      |
           |                  | created_at, updated_at       |
           |                  +--------------+---------------+
           |                                 |
           v                                 v (checked by current_school_role())
 +----------------------------------+ +----------------------------------+
 | public.teacher_class_assignments | | public.midterm_subjects          |
 |----------------------------------| |----------------------------------|
 | id (PK, UUID)                    | | id (PK, UUID)                    |
 | teacher_user_id (FK->auth.users) | | class_name (TEXT)                |
 | class_name (TEXT)                | | subject_name (TEXT)              |
 | created_by, created_at           | | is_enabled (BOOLEAN)             |
 +-----------------+----------------+ +----------------+-----------------+
                   |                                   |
                   |                                   |
                   v                                   v
 +----------------------------------+        +---------------------------+
 | public.school_students           |        | public.midterm_assessment_|
 |----------------------------------|        | marks                     |
 | id (PK, UUID)                    |<-------| id (PK, UUID)             |
 | registration_number (TEXT, UNIQUE)        | student_id (FK->students) |
 | full_name (TEXT)                 |        | subject_id (FK->subjects) |
 | class_name (TEXT)                |        | class_name, period        |
 | stream (TEXT)                    |        | mark (NUMERIC, 0-100)     |
 | parent_name (TEXT)               |        | entered_by, entered_at    |
 | email (TEXT)                     |        +-------------+-------------+
 | phone (TEXT)                     |                      |
 | fee_status (TEXT)                |                      | triggers auto-compilation
 | fee_amount (TEXT)                |                      v
 +-----------------+----------------+        +---------------------------+
                   |                         | public.midterm_reports    |
                   |                         |---------------------------|
                   |                         | id (PK, UUID)             |
                   |<------------------------| student_id (FK->students) |
                   |                         | period (TEXT)             |
                   |                         | average (NUMERIC)         |
                   |                         | total_subjects (INT)      |
                   |                         | review_status (TEXT)      |
                   |                         | generated_at, pdf_path    |
                   |                         +-------------+-------------+
                   |                                       |
                   +-----------------------+               |
                   |                       |               v
                   v                       v +---------------------------+
 +----------------------------------+        | public.midterm_report_    |
 | public.midterm_report_contacts   |        | subjects                  |
 |----------------------------------|        |---------------------------|
 | id (PK, UUID)                    |        | id (PK, UUID)             |
 | report_id (FK->midterm_reports)  |<-------| report_id (FK->reports)   |
 | parent_name, phone, email        |        | subject_name, mark, grade |
 | snapshotted_at                   |        | weight (INT)              |
 +----------------------------------+        +---------------------------+
```

---

### 3.2 Table Schema Specifications

#### 3.2.1 `public.users`
Canonical staff role registry. Controls all system RLS policies.
```sql
CREATE TYPE public.school_role AS ENUM ('dean_of_studies', 'headteacher', 'teacher', 'it');

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  role public.school_role NOT NULL DEFAULT 'teacher',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- **Constraints:** `id` cascades on Auth user deletion; `role` strictly restricted to the 4 enum states.
- **RLS:** Authenticated users can `SELECT` their own profile; only users with role `'it'` can `UPDATE` roles.

#### 3.2.2 `public.school_students`
Authoritative learner directory.
```sql
CREATE TABLE public.school_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  class_name text NOT NULL CHECK (length(trim(class_name)) > 0),
  stream text NOT NULL CHECK (length(trim(stream)) > 0),
  parent_name text NOT NULL CHECK (length(trim(parent_name)) > 0 AND lower(trim(parent_name)) <> 'not provided'),
  email text CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text CHECK (length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 8),
  fee_status text NOT NULL DEFAULT 'Unpaid' CHECK (fee_status IN ('Paid', 'Partial', 'Unpaid')),
  fee_amount text NOT NULL DEFAULT '0 RWF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3.2.3 `public.teacher_student_register` (Security Barrier View)
Restricts teachers to viewing only students in classes assigned to them.
```sql
CREATE OR REPLACE VIEW public.teacher_student_register
WITH (security_barrier = true) AS
SELECT s.id, s.full_name, s.class_name, s.stream
FROM public.school_students s
WHERE public.current_school_role() = 'teacher'
  AND EXISTS (
    SELECT 1 FROM public.teacher_class_assignments a
    WHERE a.teacher_user_id = auth.uid() AND a.class_name = s.class_name
  );
```
*Design Rationale:* Prevents leaking parent contact details, tuition balances, or unassigned class rosters to classroom teachers.

#### 3.2.4 `public.midterm_assessment_marks`
Subject marks entered by assigned teachers or the Dean.
```sql
CREATE TABLE public.midterm_assessment_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.school_students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.midterm_subjects(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  period text NOT NULL,
  mark numeric(5,2) NOT NULL CHECK (mark >= 0 AND mark <= 100),
  entered_by uuid REFERENCES auth.users(id),
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, period)
);
```

#### 3.2.5 `public.midterm_reports`
Official computed student performance report.
```sql
CREATE TABLE public.midterm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.school_students(id) ON DELETE SET NULL,
  period text NOT NULL,
  average numeric(5,2) NOT NULL DEFAULT 0,
  total_subjects int NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved')),
  teacher_comment text DEFAULT '',
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_storage_path text,
  pdf_generated_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE (student_id, period)
);
```

#### 3.2.6 `public.midterm_notification_outbox`
Transactional email outbox queue for asynchronous external delivery.
```sql
CREATE TABLE public.midterm_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  queued_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
```

---

## 4. Database Functions & Trigger Logic

### 4.1 `current_school_role()`
Security definer utility reading the authenticated user's canonical role directly from `public.users`:
```sql
CREATE OR REPLACE FUNCTION public.current_school_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.role::text
  FROM public.users u
  WHERE u.id = auth.uid();
$$;
```

### 4.2 Teacher Directory and Class Assignments
`list_school_teachers()` and `list_teacher_class_assignments()` are security-definer functions used by the Dean of Studies and IT staff. They return teacher names for the assignment picker and show the teacher names already assigned to each class. Both functions check the caller's canonical role and return no parent or student details.

### 4.3 Automated Report Compilation Trigger
When assessment marks are inserted or updated, the system checks if all enabled class subjects have a mark. Once complete, it calculates the arithmetic average, maps each mark to an REB grade (`A`, `B`, `C`, `D`, `E`) and weight, and upserts the report record:
```sql
CREATE OR REPLACE FUNCTION public.auto_compile_midterm_on_mark_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_name text;
  v_period text;
  v_student_id uuid;
  v_enabled_count int;
  v_marked_count int;
BEGIN
  v_student_id := NEW.student_id;
  v_period := NEW.period;
  v_class_name := NEW.class_name;

  SELECT count(*) INTO v_enabled_count
  FROM public.midterm_subjects
  WHERE class_name = v_class_name AND is_enabled = true;

  SELECT count(DISTINCT m.subject_id) INTO v_marked_count
  FROM public.midterm_assessment_marks m
  JOIN public.midterm_subjects s ON s.id = m.subject_id
  WHERE m.student_id = v_student_id AND m.period = v_period AND s.is_enabled = true;

  -- Only compile if all enabled subjects have received an entry
  IF v_enabled_count > 0 AND v_marked_count = v_enabled_count THEN
    PERFORM public.compile_student_midterm_report(v_student_id, v_period);
  END IF;

  RETURN NEW;
END;
$$;
```

---

## 5. Storage & Caching Architecture

### 5.1 Supabase Storage Bucket: `midterm-reports`
- **Visibility:** Private bucket (access governed by Storage RLS policies).
- **Naming Convention:** `reports/{period}/{student_id}.pdf`
- **Storage Lifecycle:**
  1. A user triggers a PDF download.
  2. The client checks `pdf_generated_at` in the report metadata.
  3. **Cache Hit:** If `pdf_generated_at` is non-null and `now() - pdf_generated_at < 7 days`, a signed download URL is requested directly from Supabase Storage.
  4. **Cache Miss / Invalidation:** If null or older than 7 days, the client recompiles the PDF using `jspdf`, uploads the new binary stream to `reports/{period}/{student_id}.pdf` with `upsert: true`, and updates `pdf_generated_at = now()`.

---

## 6. Realtime Synchronization & Event Subscriptions

In `src/App.tsx`, parent contact lists are maintained in real-time using Supabase Realtime Channels. When the Dean or an administrator edits or imports student records, connected client instances immediately reflect the updated guardian contact directory without page reloads:

```typescript
const channel = client
  .channel('student-registry-parent-contacts')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'school_students' }, async () => {
    const { data } = await client
      .from('school_students')
      .select('id, parent_name, full_name, class_name, phone, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    setContacts((data ?? []).map((row) => mapStudentToParentContact(row)));
  })
  .subscribe();
```
