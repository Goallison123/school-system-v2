# API & Integration Specifications
## G.S Gacuba 2A Integrated School Administration Portal

- **Protocol:** HTTPS RESTful / WebSockets (Realtime)
- **Data Exchange Format:** JSON (`application/json`)
- **API Architectural Style:** PostgREST on Supabase + Deno Serverless Edge Functions
- **Document Version:** 2.0.0
- **Status:** Approved Baseline

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
      "class_name": "S6 A",
      "stream": "A",
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

## 5. Serverless Edge Functions: Resend Email Worker

### `POST /functions/v1/dispatch-midterm-emails`
Processes undelivered rows in `public.midterm_notification_outbox`. Triggered on a schedule or via secure administrative invocation.

- **Headers:**
  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
  - `Content-Type: application/json`

- **Execution Workflow:**
  1. Selects pending rows:
     `SELECT id, recipient_email, event_type, payload FROM public.midterm_notification_outbox WHERE delivered_at IS NULL LIMIT 50;`
  2. Dispatches HTTP POST to Resend API:
     - URL: `https://api.resend.com/emails`
     - Header: `Authorization: Bearer ${RESEND_API_KEY}`
     - Body:
       ```json
       {
         "from": "G.S Gacuba 2A <notifications@gacuba2a.rw>",
         "to": "teacher@gacuba2a.rw",
         "subject": "Mid-Term Examination Date Scheduled",
         "html": "<h3>Official Mid-Term Examination Date Set</h3><p>Date: 2026-11-16</p>"
       }
       ```
  3. Updates database on success:
     `UPDATE public.midterm_notification_outbox SET delivered_at = now() WHERE id = :id;`

- **Response `200 OK`:**
```json
{
  "success": true,
  "processed": 14,
  "failed": 0
}
```

---

## 6. External SMS Gateway Integration Contract

SMS campaigns are stored in `public.sms_campaign_dispatches` and `public.midterm_sms_dispatches`. External telecommunication providers, AT for now, communicate using this standard gateway protocol: 

### 6.1 Outbound SMS Dispatch Payload
```json
{
  "sender_id": "GS_GACUBA2A",
  "dispatch_fingerprint": "FEES|Dear Parent, remaining school fees balance...|71000000-0000-4000-8000-000000000001",
  "recipients": [
    {
      "recipient_id": "71000000-0000-4000-8000-000000000001",
      "phone": "+250788123456",
      "message": "Dear Parent, remaining school fees balance for INEZA Divine is 0 RWF. Please settle promptly."
    }
  ]
}
```

### 6.2 Delivery Status Callback (Webhook)
```http
POST /functions/v1/sms-delivery-callback HTTP/1.1
Host: <project-ref>.supabase.co
Content-Type: application/json

{
  "dispatch_fingerprint": "FEES|Dear Parent...",
  "recipient_id": "71000000-0000-4000-8000-000000000001",
  "status": "DELIVERED",
  "network_code": "63510",
  "timestamp": "2026-10-15T10:45:12Z"
}
```
