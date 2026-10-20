
-- G.S. Gacuba 2A School Platform
-- Production core schema for a fresh Supabase project.
-- Apply only to the new production database after reviewing and testing.

BEGIN;

-- 1. Roles ---------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.school_role AS ENUM (
    'teacher',
    'dean_of_studies',
    'headteacher',
    'it'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2. User profiles -------------------------------------------------------

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role public.school_role NOT NULL DEFAULT 'teacher',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_school_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT u.role::text
     FROM public.users u
     WHERE u.id = (SELECT auth.uid())),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.current_school_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_school_role() TO authenticated;

-- Create a profile for each new authenticated account.
-- New accounts receive teacher role; elevated roles must be assigned
-- through a trusted administrative process, never user-controlled metadata.

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'teacher'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

-- 3. Students and teacher assignments -----------------------------------

CREATE TABLE public.school_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_code text NOT NULL UNIQUE,
  registration_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  parent_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  class_name text NOT NULL,
  stream text NOT NULL DEFAULT '',
  fee_status text NOT NULL DEFAULT 'Unpaid',
  fee_amount text NOT NULL DEFAULT '0 RWF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_students_name_nonempty
    CHECK (length(trim(full_name)) > 0),
  CONSTRAINT school_students_class_nonempty
    CHECK (length(trim(class_name)) > 0)
);

CREATE TABLE public.teacher_class_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.users(id)
    ON DELETE RESTRICT,
  class_name text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, class_name)
);

-- 4. Academic periods ----------------------------------------------------

CREATE TABLE public.midterm_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  official_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  CONSTRAINT midterm_periods_status_check
    CHECK (status IN ('scheduled', 'open', 'finalized')),
  CONSTRAINT midterm_periods_finalized_timestamp_check
    CHECK (
      (status = 'finalized' AND finalized_at IS NOT NULL
       AND finalized_by IS NOT NULL)
      OR
      (status <> 'finalized' AND finalized_at IS NULL
       AND finalized_by IS NULL)
    ),
  CONSTRAINT midterm_periods_name_nonempty
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE public.midterm_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL,
  subject_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_name, subject_name),
  CHECK (length(trim(class_name)) > 0),
  CHECK (length(trim(subject_name)) > 0)
);

-- 5. Marks: period_id is authoritative ----------------------------------

CREATE TABLE public.student_midterm_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.school_students(id)
    ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id)
    ON DELETE RESTRICT,
  class_name text NOT NULL,
  subject_id uuid NOT NULL REFERENCES public.midterm_subjects(id)
    ON DELETE RESTRICT,
  mark numeric(5,2) NOT NULL CHECK (mark >= 0 AND mark <= 100),
  entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_id, subject_id)
);

CREATE INDEX student_midterm_marks_period_idx
  ON public.student_midterm_marks(period_id);

CREATE INDEX student_midterm_marks_class_idx
  ON public.student_midterm_marks(class_name);

-- 6. Reports -------------------------------------------------------------

CREATE TABLE public.midterm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.school_students(id)
    ON DELETE SET NULL,
  student_name text NOT NULL,
  class_name text NOT NULL,
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id)
    ON DELETE RESTRICT,
  average numeric(5,2) NOT NULL DEFAULT 0
    CHECK (average >= 0 AND average <= 100),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_generated_at timestamptz,
  pdf_storage_path text,
  teacher_comment text NOT NULL DEFAULT ''
);

CREATE INDEX midterm_reports_period_student_idx
  ON public.midterm_reports(period_id, student_id);

CREATE TABLE public.midterm_report_contacts (
  report_id uuid PRIMARY KEY REFERENCES public.midterm_reports(id)
    ON DELETE CASCADE,
  parent_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.midterm_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  official_date date,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'extended')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.midterm_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 7. Notification and SMS audit records ---------------------------------

CREATE TABLE public.midterm_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_email text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  delivered_at timestamptz
);

CREATE TABLE public.midterm_sms_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id)
    ON DELETE RESTRICT,
  campaign_id uuid,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Role and period validation -----------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_can_enter_mark(
  p_student_id uuid,
  p_class_name text,
  p_subject_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_class_assignments a
    JOIN public.school_students s
      ON s.id = p_student_id
     AND s.class_name = p_class_name
    JOIN public.midterm_subjects sub
      ON sub.id = p_subject_id
     AND sub.class_name = p_class_name
     AND sub.is_enabled
    WHERE a.teacher_user_id = (SELECT auth.uid())
      AND a.class_name = p_class_name
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_can_enter_mark(uuid, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_can_enter_mark(uuid, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_midterm_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_role text;
BEGIN
  v_role := public.current_school_role();

  IF TG_OP = 'UPDATE'
     AND OLD.period_id IS DISTINCT FROM NEW.period_id THEN
    RAISE EXCEPTION 'Marks cannot be moved between periods.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT p.status INTO v_status
    FROM public.midterm_periods p
    WHERE p.id = OLD.period_id
    FOR SHARE;
  ELSE
    SELECT p.status INTO v_status
    FROM public.midterm_periods p
    WHERE p.id = NEW.period_id
    FOR SHARE;
  END IF;

  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Marks can only be changed while a period is open.';
  END IF;

  IF v_role NOT IN ('dean_of_studies', 'teacher') THEN
    RAISE EXCEPTION 'This role cannot change academic marks.';
  END IF;

  IF v_role = 'teacher' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Teachers cannot delete marks.';
    END IF;

    IF NOT public.teacher_can_enter_mark(
      NEW.student_id, NEW.class_name, NEW.subject_id
    ) THEN
      RAISE EXCEPTION 'You are not assigned to this class and subject.';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.school_students s
      JOIN public.midterm_subjects sub
        ON sub.id = NEW.subject_id
      WHERE s.id = NEW.student_id
        AND s.class_name = NEW.class_name
        AND sub.class_name = NEW.class_name
    ) THEN
      RAISE EXCEPTION 'Student, class, and subject do not match.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_midterm_mark_before_change
BEFORE INSERT OR UPDATE OR DELETE ON public.student_midterm_marks
FOR EACH ROW EXECUTE FUNCTION public.validate_midterm_mark();

-- 9. RLS: deny anonymous access and define authenticated access ---------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_midterm_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_report_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_sms_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users FROM anon, authenticated;
REVOKE ALL ON public.school_students FROM anon, authenticated;
REVOKE ALL ON public.teacher_class_assignments FROM anon, authenticated;
REVOKE ALL ON public.midterm_periods FROM anon, authenticated;
REVOKE ALL ON public.midterm_subjects FROM anon, authenticated;
REVOKE ALL ON public.student_midterm_marks FROM anon, authenticated;
REVOKE ALL ON public.midterm_reports FROM anon, authenticated;
REVOKE ALL ON public.midterm_report_contacts FROM anon, authenticated;
REVOKE ALL ON public.midterm_settings FROM anon, authenticated;
REVOKE ALL ON public.midterm_notification_outbox FROM anon, authenticated;
REVOKE ALL ON public.midterm_sms_dispatches FROM anon, authenticated;

GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.school_students TO authenticated;
GRANT SELECT ON public.teacher_class_assignments TO authenticated;
GRANT SELECT ON public.midterm_periods TO authenticated;
GRANT SELECT ON public.midterm_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.student_midterm_marks TO authenticated;
GRANT SELECT ON public.midterm_reports TO authenticated;
GRANT SELECT ON public.midterm_report_contacts TO authenticated;
GRANT SELECT ON public.midterm_settings TO authenticated;
GRANT SELECT, UPDATE ON public.midterm_notification_outbox TO authenticated;
GRANT SELECT ON public.midterm_sms_dispatches TO authenticated;

-- User profiles: own profile only. No client-side role changes.
CREATE POLICY users_read_self_or_it
ON public.users FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR public.current_school_role() = 'it');

-- Students: academic and technical roles may view records.
CREATE POLICY students_read_authorized
ON public.school_students FOR SELECT TO authenticated
USING (
  public.current_school_role() IN
    ('dean_of_studies', 'headteacher', 'it')
  OR (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = school_students.class_name
    )
  )
);

-- Only the dean manages student registry data.
CREATE POLICY students_insert_dean
ON public.school_students FOR INSERT TO authenticated
WITH CHECK (public.current_school_role() = 'dean_of_studies');

CREATE POLICY students_update_dean
ON public.school_students FOR UPDATE TO authenticated
USING (public.current_school_role() = 'dean_of_studies')
WITH CHECK (public.current_school_role() = 'dean_of_studies');

CREATE POLICY students_delete_dean
ON public.school_students FOR DELETE TO authenticated
USING (public.current_school_role() = 'dean_of_studies');

-- Teachers see their own assignments; dean and IT can troubleshoot.
CREATE POLICY assignments_read_authorized
ON public.teacher_class_assignments FOR SELECT TO authenticated
USING (
  teacher_user_id = (SELECT auth.uid())
  OR public.current_school_role() IN ('dean_of_studies', 'it')
);

CREATE POLICY assignments_manage_dean
ON public.teacher_class_assignments FOR ALL TO authenticated
USING (public.current_school_role() = 'dean_of_studies')
WITH CHECK (public.current_school_role() = 'dean_of_studies');

-- Periods are readable by authenticated school staff.
-- Mutations must use the dean-only RPCs added in the next migration.
CREATE POLICY periods_read_staff
ON public.midterm_periods FOR SELECT TO authenticated
USING (
  public.current_school_role() IN
    ('teacher', 'dean_of_studies', 'headteacher', 'it')
);

-- Subjects are readable by staff; only the dean manages them.
CREATE POLICY subjects_read_staff
ON public.midterm_subjects FOR SELECT TO authenticated
USING (
  public.current_school_role() IN
    ('teacher', 'dean_of_studies', 'headteacher', 'it')
);

CREATE POLICY subjects_manage_dean
ON public.midterm_subjects FOR ALL TO authenticated
USING (public.current_school_role() = 'dean_of_studies')
WITH CHECK (public.current_school_role() = 'dean_of_studies');

-- Marks: dean manages; IT and headteacher are read-only; teachers
-- can edit marks only in their assigned classes while the period is open.
CREATE POLICY marks_read_authorized
ON public.student_midterm_marks FOR SELECT TO authenticated
USING (
  public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  OR (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = student_midterm_marks.class_name
    )
  )
);

CREATE POLICY marks_insert_authorized
ON public.student_midterm_marks FOR INSERT TO authenticated
WITH CHECK (
  public.current_school_role() = 'dean_of_studies'
  OR (
    public.current_school_role() = 'teacher'
    AND public.teacher_can_enter_mark(student_id, class_name, subject_id)
  )
);

CREATE POLICY marks_update_authorized
ON public.student_midterm_marks FOR UPDATE TO authenticated
USING (
  public.current_school_role() = 'dean_of_studies'
  OR (
    public.current_school_role() = 'teacher'
    AND public.teacher_can_enter_mark(student_id, class_name, subject_id)
  )
)
WITH CHECK (
  public.current_school_role() = 'dean_of_studies'
  OR (
    public.current_school_role() = 'teacher'
    AND public.teacher_can_enter_mark(student_id, class_name, subject_id)
  )
);

CREATE POLICY marks_delete_dean
ON public.student_midterm_marks FOR DELETE TO authenticated
USING (public.current_school_role() = 'dean_of_studies');

-- Reports are visible to dean, headteacher and IT.
-- Report creation and approval are intentionally not granted directly.
CREATE POLICY reports_read_authorized
ON public.midterm_reports FOR SELECT TO authenticated
USING (
  public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  OR (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = midterm_reports.class_name
    )
  )
);

-- Parent contact snapshots are limited to academic leadership.
CREATE POLICY report_contacts_read_academic
ON public.midterm_report_contacts FOR SELECT TO authenticated
USING (
  public.current_school_role() IN ('dean_of_studies', 'headteacher')
);

CREATE POLICY settings_read_staff
ON public.midterm_settings FOR SELECT TO authenticated
USING (
  public.current_school_role() IN
    ('teacher', 'dean_of_studies', 'headteacher', 'it')
);

CREATE POLICY outbox_read_recipient_or_staff
ON public.midterm_notification_outbox FOR SELECT TO authenticated
USING (
  recipient_user_id = (SELECT auth.uid())
  OR public.current_school_role() IN ('dean_of_studies', 'it')
);

CREATE POLICY outbox_mark_own_read
ON public.midterm_notification_outbox FOR UPDATE TO authenticated
USING (recipient_user_id = (SELECT auth.uid()))
WITH CHECK (recipient_user_id = (SELECT auth.uid()));

CREATE POLICY sms_dispatches_read_staff
ON public.midterm_sms_dispatches FOR SELECT TO authenticated
USING (public.current_school_role() IN ('dean_of_studies', 'it'));

COMMIT;
