# API & Integration Specifications
## G.S Gacuba 2A Integrated School Administration Portal

- **Protocol:** HTTPS RESTful / WebSockets (Realtime)
- **Data Exchange Format:** JSON (`application/json`)
- **API Architectural Style:** PostgREST on Supabase + Deno Serverless Edge Functions
- **Document Version:** 2.1.0
- **Status:** Approved Baseline (Production v2.1.0)

---

## 1. Authentication & Security Headers

Every request to the backend services must include standard authorization headers issued by Supabase Auth:

```http
GET /rest/v1/school_students?select=* HTTP/1.1
Host: <project-ref>.supabase.co
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <USER_ACCESS_TOKEN_JWT>
Content-Type: application/json
Prefer: return=representation
```

### 1.1 Header Matrix
| Header Name | Mandatory | Description |
|---|---|---|
| `apikey` | Yes | Public Supabase project client identification token. |
| `Authorization` | Yes | Bearer token (`Bearer <JWT>`) containing authenticated user identity (`sub`, `aud: authenticated`, `role: authenticated`). |
| `Content-Type` | Yes | `application/json` for write endpoints. |
| `Prefer` | Optional | `return=representation` returns inserted/updated rows; `resolution=merge-duplicates` enables upsert semantics. |

---

## 2. Supabase PostgREST Table Endpoints

### 2.1 Students & Registry API

#### `GET /rest/v1/school_students`
Retrieves student profiles. Restricted by RLS to `dean_of_studies`, `headteacher`, and `it`. Teachers receive an HTTP 403 Forbidden or empty set.

- **Query Parameters:**
  - `select`: Column projection (`id, registration_number, full_name, class_name, stream, parent_name, email, phone, fee_status, fee_amount`).
  - `class_name`: Filter by class (e.g. `eq.S2 A`).
  - `fee_status`: Filter by status (e.g. `eq.Paid`, `eq.Unpaid`).
  - `order`: Sort column (e.g. `class_name.asc,full_name.asc`).

- **Response `200 OK`:**
```json
[
  {
    "id": "71000000-0000-4000-8000-000000000001",
    "registration_number": "STU-101",
    "full_name": "INEZA Divine",
    "class_name": "S2 A",
    "stream": "A",
    "parent_name": "Jean Claude Uwase",
    "email": "divine.ineza@gmail.com",
    "phone": "+250788123456",
    "fee_status": "Paid",
    "fee_amount": "24,000 RWF",
    "created_at": "2026-10-12T08:30:00Z"
  }
]
```

#### `POST /rest/v1/school_students`
Registers a new student. Permitted only for `dean_of_studies` and `it`.

- **Request Body:**
```json
{
  "registration_number": "STU-107",
  "full_name": "MUGISHA Jean Claude",
  "class_name": "S1 A",
  "stream": "A",
  "parent_name": "Jean Bosco Mugisha",
  "email": "jbmugisha@gmail.com",
  "phone": "+250780000111",
  "fee_status": "Paid",
  "fee_amount": "24,000 RWF"
}
```
- **Response `201 Created`:** Returns the committed record.

---

### 2.2 Teacher-Restricted Register View

#### `GET /rest/v1/teacher_student_register`
Read-only view for teachers. PostgreSQL RLS returns only studeny names and streams for classes assigned to the requesting teacher.

- **Response `200 OK`:**
```json
[
  {
    "id": "71000000-0000-4000-8000-000000000001",
    "full_name": "INEZA Divine",
    "class_name": "S2 A",
    "stream": "A"
  }
]
```
*(Notice: Parent name, phone, email, and tuition fee amounts are completely excluded from the projection).*

---

### 2.3 Mid-Term Assessment Marks API

#### `GET /rest/v1/midterm_assessment_marks`
Retrieves marks for a class stream and examination period.

- **Query Parameters:**
  - `class_name=eq.S2 A`
  - `period=eq.2026 Mid-Term`
  - `select=*,subject:midterm_subjects(*)`

- **Response `200 OK`:**
```json
[
  {
    "id": "74000000-0000-4000-8000-000000000001",
    "student_id": "71000000-0000-4000-8000-000000000001",
    "subject_id": "72000000-0000-4000-8000-000000000001",
    "class_name": "S2 A",
    "period": "2026 Mid-Term",
    "mark": 85.00,
    "entered_by": "00000000-0000-0000-0000-000000000003",
    "entered_at": "2026-10-14T09:15:00Z",
    "subject": {
      "id": "72000000-0000-4000-8000-000000000001",
      "subject_name": "Mathematics",
      "is_enabled": true
    }
  }
]
```

#### `POST /rest/v1/midterm_assessment_marks` (Upsert Mark)
Saves an assessment mark. Triggers automatic report card compilation if all enabled subjects have marks.

- **Request Body:**
```json
{
  "student_id": "71000000-0000-4000-8000-000000000001",
  "subject_id": "72000000-0000-4000-8000-000000000001",
  "class_name": "P2 A",
  "period": "2026 Mid-Term",
  "mark": 90.00
}
```

---

### 2.4 Mid-Term Reports API

#### `GET /rest/v1/midterm_reports`
Queries compiled student report cards.

- **Query Parameters:**
  - `period=eq.2026 Mid-Term`
  - `is_deleted=eq.false`
  - `select=*,report_data:midterm_report_subjects(*)`

- **Response `200 OK`:**
```json
[
  {
    "id": "73000000-0000-4000-8000-000000000001",
    "student_id": "71000000-0000-4000-8000-000000000001",
    "period": "2026 Mid-Term",
    "average": 84.33,
    "total_subjects": 3,
    "review_status": "approved",
    "teacher_comment": "Excellent academic performance and leadership in class.",
    "generated_at": "2026-10-14T10:00:00Z",
    "pdf_storage_path": "reports/2026 Mid-Term/71000000-0000-4000-8000-000000000001.pdf",
    "pdf_generated_at": "2026-10-14T10:02:00Z",
    "report_data": [
      {
        "subject_name": "Mathematics",
        "mark": 85.00,
        "grade": "A",
        "weight": 9
      },
      {
        "subject_name": "English",
        "mark": 78.00,
        "grade": "B",
        "weight": 8
      },
      {
        "subject_name": "Kinyarwanda",
        "mark": 90.00,
        "grade": "A",
        "weight": 9
      }
    ]
  }
]
```

---

## 3. Remote Procedure Calls (RPC Stored Functions)

### 3.1 `POST /rest/v1/rpc/current_school_role`
Returns the caller's authoritative role enum string.
- **Request:** `{}`
- **Response `200 OK`:** `"dean_of_studies"` (or `"headteacher"`, `"teacher"`, `"it"`, `""`).

### 3.2 `POST /rest/v1/rpc/compile_student_midterm_report`
Explicit administrative compilation or force-regeneration for an individual student.
- **Request Body:**
```json
{
  "p_student_id": "71000000-0000-4000-8000-000000000001",
  "p_period": "2026 Mid-Term"
}
```
- **Response `200 OK`:** Returns the newly compiled report UUID.

### 3.3 `POST /rest/v1/rpc/import_school_students`
Executes an atomic batch insert of validated student records.
- **Request Body:**
```json
{
  "p_students": [
    {
      "registration_number": "REG-2026-101",
      "full_name": "Kwizera Yves",
      "class_name": "S6 MPC",
      "stream": "MPC",
      "parent_name": "Aline Uwimbabazi",
      "email": "kwizera.yves@gmail.com",
      "phone": "+250791444333",
      "fee_status": "Partial",
      "fee_amount": "20,000 RWF"
    }
  ]
}
```

---

## 4. Supabase Storage API: `midterm-reports`

Private document storage bucket for generated PDF report cards.

### 4.1 Upload Compiled PDF
```http
POST /storage/v1/object/midterm-reports/reports/2026%20Mid-Term/71000000-0000-4000-8000-000000000001.pdf HTTP/1.1
Host: <project-ref>.supabase.co
Authorization: Bearer <USER_JWT>
Content-Type: application/pdf
x-upsert: true

[Binary PDF Payload]
```

### 4.2 Generate Temporary Signed Download URL
```http
POST /storage/v1/object/sign/midterm-reports/reports/2026%20Mid-Term/71000000-0000-4000-8000-000000000001.pdf HTTP/1.1
Host: <project-ref>.supabase.co
Authorization: Bearer <USER_JWT>
Content-Type: application/json

{
  "expiresIn": 3600
}
```
- **Response `200 OK`:**
```json
{
  "signedURL": "https://<project-ref>.supabase.co/storage/v1/object/sign/midterm-reports/...?token=..."
}
```

---

## 5. Serverless Deno Edge Functions (v2.1.0)

All edge functions reside in `/supabase/functions` and execute in the Deno runtime with CORS and bearer authentication.

### 5.1 `POST /functions/v1/issue-midterm-links`
Generates cryptographically random, URL-safe access tokens for student reports in an academic period.

- **Headers:**
  - `Authorization: Bearer <USER_ACCESS_TOKEN_JWT>` or `Bearer <SERVICE_ROLE_KEY>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "report_ids": [
      "71000000-0000-4000-8000-000000000001",
      "71000000-0000-4000-8000-000000000002"
    ]
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "issued_count": 2,
    "links": [
      {
        "report_id": "71000000-0000-4000-8000-000000000001",
        "access_token": "a4f89d3c-9102-4ec5-b1a0-e3256191f4aa",
        "url": "https://portal.gsgacuba2a.rw/report?token=a4f89d3c-9102-4ec5-b1a0-e3256191f4aa"
      }
    ]
  }
  ```

---

### 5.2 `GET /functions/v1/download-midterm-report?token=<ACCESS_TOKEN>`
Publicly accessible (unauthenticated) endpoint for parents to download the official student report card.

- **Query Parameters:**
  - `token` (string, required): Cryptographic access token issued by `issue-midterm-links`.
- **Response Headers:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="GS_Gacuba2A_MidTerm_Report.pdf"`
- **Response Status Codes:**
  - `200 OK`: Binary PDF stream rendered with official badge, teacher marks, REB grading, and stamp.
  - `404 Not Found`: Token invalid, expired, or academic period revoked.

---

### 5.3 `POST /functions/v1/finalize-midterm`
Executes server-side atomic finalization of an academic period.

- **Headers:**
  - `Authorization: Bearer <HEADMASTER_OR_ADMIN_JWT>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "period_id": "81000000-0000-4000-8000-000000000001"
  }
  ```
- **Execution Workflow:**
  1. Validates that current user role is `headmaster` or `admin`.
  2. Confirms all active classes have recorded marks for enabled subjects.
  3. Computes class averages and ranks.
  4. Freezes student demographic and contact snapshots into `midterm_reports`.
  5. Updates `midterm_periods.status = 'finalized'`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "period_id": "81000000-0000-4000-8000-000000000001",
    "status": "finalized",
    "finalized_reports_count": 842
  }
  ```

---

### 5.4 `POST /functions/v1/send-sms`
Secure serverless proxy interfacing with the Africa's Talking SMS API gateway. Protects credentials from client-side bundles and validates Rwandan mobile numbering (+250).

- **Headers:**
  - `Authorization: Bearer <AUTHENTICATED_USER_JWT>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "to": ["+250788123456", "+250722987654"],
    "message": "G.S Gacuba 2A: Mid-Term reports for Term 1 are now available online. View here: https://portal.gsgacuba2a.rw/report?token=a4f89d3c",
    "enqueue": true
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "recipients": [
      {
        "number": "+250788123456",
        "status": "Success",
        "messageId": "ATXid_b7a8c9e012",
        "cost": "RWF 15.00"
      }
    ]
  }
  ```

---

### 5.5 `POST /functions/v1/deliver-midterm-parent-notifications`
High-volume batch orchestrator that queries compiled report links and sends customized SMS messages to parent rosters.

- **Headers:**
  - `Authorization: Bearer <ADMIN_OR_HEADMASTER_JWT>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "period_id": "81000000-0000-4000-8000-000000000001",
    "class_name": "S3 A",
    "template": "Muraho {parent_name}, indangamanota ya {student_name} ({class_name}) irabonetse: {report_link}"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "queued": 48,
    "skipped_no_phone": 2
  }
  ```

---

### 5.6 `POST /functions/v1/send-midterm-reminders`
Scheduled or on-demand notification agent dispatching internal reminders to teachers with pending mark entries.

- **Headers:**
  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "reminded_teachers_count": 6,
    "classes_pending": ["S2 B", "S1 C"]
  }
  ```

---

## 6. External Telecommunications Gateway Specification (Africa's Talking)

- **Provider:** Africa's Talking Ltd (Rwanda Node)
- **Supported Rwandan Carrier Networks:** MTN Rwanda (`63510`), Airtel Rwanda (`63513`)
- **Number Normalization:** All destination addresses must conform to E.164 format: `+2507[2|3|8|9]XXXXXXX`.
- **Sender ID:** `GACUBA2A` (Configured through Rwanda Utilities Regulatory Authority - RURA registration).

