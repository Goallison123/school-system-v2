
# School System — Database Production Audit

**Project:** G.S Gacuba 2A School System  
**Database:** Supabase PostgreSQL  
**Status:** Audit in progress  
**Rule:** No production schema changes until existing tables, policies, and dependencies have been verified.

## 1. Objectives

- Establish the actual database schema used by the application.
- Identify missing tables, columns, foreign keys, indexes, functions, and triggers.
- Verify authentication and role-based access control.
- Eliminate public access to private student and staff information.
- Preserve historical academic records.
- Make messaging, reports, and scheduled jobs reliable and auditable.
- Keep database migrations version-controlled and repeatable.

## 2. Existing database objects referenced by application code

These names are referenced by the inspected application code or existing migrations. Their presence in the live database has not yet been verified. @prashant shall make sure that the production database differs from the staging database (will be used for dev too). Therefore, ensuring that the database is on production grade remains his responsibility.

### Students and staff

- `school_students`
- `teacher_student_register`
- `users`
- `teacher_class_assignments`

### Mid-term assessment

- `midterm_subjects`
- `student_midterm_marks`
- `midterm_reports`
- `midterm_settings`
- `midterm_notification_outbox`
- `midterm_periods` — proposed by the new workflow; verify whether it exists.

### Communications and automation

- `notification_campaigns`
- `sms_campaign_dispatches`
- `school_contacts`
- Automation rules and delivery logs — currently partly stored in browser `localStorage`.

### Website content and inquiries

- `school_content`
- `school_inquiries`
- `news_items`
- `gallery_items`

### Workspace settings

- `workspace_settings`

## 3. Database functions referenced or required

Verify that each function exists, has the expected signature, and has appropriate permissions.

- `current_school_role()`
- `list_school_teachers()`
- `list_teacher_class_assignments()`
- `set_midterm_report_pdf_metadata()`
- `get_midterm_reminder_targets()` — required by the proposed reminder function.
- `mark_midterm_reminder_sent(...)` — required by the proposed reminder function.

Additional functions and triggers may be discovered during schema inspection.

## 4. Academic access-control requirements

- Only the dean of studies can edit mid-term marks.
- IT administrators must not inherit dean-only mark-editing permissions.
- Teachers may only access academic data explicitly permitted for their assignments.
- Only authorized academic staff may create or manage assessment periods. currently the dean of studies.
- Report generation must not finalize an assessment period.
- Explicit finalization must prevent further mark changes. If students make reclamation, those changes in marks will not be reflected in this system. CAMIS shall handle that during final termly reports, unless requested by the school.
- Finalized marks and reports must remain available as historical records.
- Every new assessment period must have a distinct identifier.
- Historical records must never be reassigned to a new period merely because the current year changes.

These requirements must be enforced by PostgreSQL permissions, RLS policies, and secured database functions—not only by frontend controls.

## 5. Student data protection

- Anonymous users (who does not exist on the current build yet) must not be able to read or modify private student records.
- Authenticated users must only access data authorized for their role.
- Service-role credentials must never be included in frontend environment variables.
- Role changes must be restricted and auditable. This is done only by the school IT.
- Database exports and seed scripts must not expose real student or parent information.
- Data retention and backup procedures must be documented. On free plans (which we are currently using until the school finds it a need to upgrade. Backup is not available in the current plan, thefore, all party will do their best to avoid data loss as long as no backup service in the current plan.)

## 6. Schema and integrity requirements

Verify the following before adding or changing any constraints:

- Primary keys and foreign keys.
- Unique student registration identifiers.
- Unique teacher-to-class assignments where appropriate.
- Unique marks for each assessment period, student, and subject.
- Valid mark ranges and required values.
- Appropriate deletion behavior for related records.
- Consistent timestamp handling.
- Indexes for frequently used filters, joins, and ordering.
- Appropriate constraints for campaign and delivery statuses.
- Appropriate indexes and uniqueness constraints for scheduled job idempotency.

Do not add a constraint until existing records have been checked for violations.

## 7. Existing migration review (on the date of writing of this markdown)

Review existing migrations before preparing corrective migrations.

Known migration:

- `supabase/migrations/20260812072940_create_school_admin_workspace.sql`

This migration defines workspace tables and grants broad access to anonymous and authenticated users. Verify the deployed policies and plan a safe replacement for sensitive data.

Known migration:

- `supabase/migrations/20261020120000_add_teacher_assignment_directory.sql`

This migration defines teacher-directory functions and permits both the dean of studies and IT to access teacher directory information. Directory access must be distinguished from mark-editing authority.

Do not rewrite or delete migration history to repair production.

## 8. Production audit checklist

### Schema
- [ ] Inventory all public tables, columns, types, defaults, and nullability.
- [ ] Inventory primary keys, foreign keys, unique constraints, and check constraints.
- [ ] Inventory indexes and identify missing or redundant indexes.
- [ ] Inventory views, functions, triggers, and extensions.
- [ ] Compare live schema with committed migrations.

### Security
- [ ] Inventory RLS-enabled tables and policies.
- [ ] Verify anonymous access is restricted.
- [ ] Test permissions for dean, headteacher, teacher, and IT roles.
- [ ] Verify role checks against authenticated user identity.
- [ ] Verify storage bucket policies for generated reports. storage buckets not yet confirmed created (@prashant will be responsible for creating and getting them configured)
- [ ] Verify secrets are stored server-side.

### Academic workflow
- [ ] Verify assessment period isolation.
- [ ] Verify marks cannot be changed after finalization.
- [ ] Verify report generation does not finalize a period.
- [ ] Verify previous reports remain accessible.
- [ ] Verify reminder delivery is idempotent.

### Operations
- [ ] Verify migration and rollback procedures.
- [ ] Verify backups and recovery procedures.
- [ ] Verify database error logging.
- [ ] Verify scheduled job monitoring.
- [ ] Verify development seed data is safe.
- [ ] Run production checks before deployment.

## 9. Migration rules

1. Inspect before altering.
2. Prefer additive, version-controlled migrations.
3. Never drop or rename production objects without a verified migration plan.
4. Preserve existing student, mark, and report records.
5. Test migrations on a separate environment first.
6. Apply restrictive RLS policies only after confirming authorized access paths.
7. Record the reason and validation steps for every production migration.
8. Keep credentials out of source control.

## 10. Next action

Obtain a read-only inventory of the actual Supabase schema, including tables, columns, constraints, indexes, RLS policies, functions, and triggers.

Use that inventory to reconcile the live database with the repository before creating the first production migration.

---

## 11. Production Storage Capacity & Scope Sizing Audit

### 11.1 Infrastructure Baseline
- **Database Engine:** Supabase PostgreSQL 15 Managed Instance
- **Database Storage Quota:** 500 MB (Baseline Free Tier Allocation)
- **Object / Bucket Storage Quota:** 1 GB (Baseline Free Tier Allocation)

### 11.2 Population & Data Volume Projections
- **Active Students:** 800 to 1,000 active students per academic year.
- **Departed/Archived Students:** Preserved in `school_students_archive` with mandatory reason audit logs.
- **Staff Users:** 20 to 30 staff members (`public.users`) across all administrative and pedagogical roles.

### 11.3 Scope Verification: Explicit Inclusions & Exclusions
- **INCLUDED IN SCHEMA:**
  - `school_students` & `school_students_archive` (Student profiles and contact numbers).
  - `users` & `teacher_class_assignments` (Staff profiles and stream assignments).
  - `midterm_periods`, `midterm_subjects`, `student_midterm_marks`, `midterm_reports` (Academic evaluation).
  - `notification_campaigns`, `sms_campaign_dispatches` (Africa's Talking SMS records).
  - `midterm_reports.report_data` (JSONB report snapshots) + 7-Day Ephemeral PDF delivery.
- **EXCLUDED FROM SCHEMA (Zero Schema Footprint):**
  - **Daily Attendance:** No attendance tables exist. Deliberately excluded to eliminate millions of volatile daily rows.
  - **Staff Payroll / HR:** No payroll, salary, or financial employee tables exist. Managed externally.
  - **Comprehensive Multi-Term Transcripts:** Focused strictly on mid-term reports.

### 11.4 1-Year Survival Calculations
1. **Relational Database Rows:** 1,000 students × 15 subjects × 3 terms = ~45,000 mark rows per year (~10–15 MB). Adding student profiles, contacts, and audit logs brings total relational data to **under 25 MB per academic year**, consuming only ~5% of the 500 MB quota.
2. **File Storage (PDF Reports):** Individual PDF report cards average ~150 KB. Enforcing a **7-day ephemeral cache lifecycle** ensures generated reports expire and purge after the active parent distribution window. Peak storage during report release sits at ~150–250 MB and clears, never breaching the **1 GB** allocation.
3. **Verdict:** The platform can operate for an entire academic year within the baseline 500 MB database and 1 GB storage allocations.

### 11.5 Hosting Upgrades & Maintenance Responsibility
- Supabase storage cannot be expanded independently without upgrading the entire hosting plan subscription.
- The school administration is formally responsible for upgrading the hosting and database plans if institutional growth (e.g., student population exceeding 1,000, multi-year unpruned archives, or non-standard storage use) demands capacity exceeding baseline service plan allocations.

