-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Core Migration (02 of 03)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: Mid-Term Academic Engine, Subject Matrices, Marks Entry, Reports & RPCs
-- ============================================================================

BEGIN;

-- 1. Mid-Term Periods -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.midterm_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  official_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('scheduled', 'open', 'finalized')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  CONSTRAINT midterm_periods_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS midterm_periods_status_idx ON public.midterm_periods(status);
CREATE INDEX IF NOT EXISTS midterm_periods_date_idx ON public.midterm_periods(official_date DESC);

-- 2. Curriculum & Subject Offerings -----------------------------------------

CREATE TABLE IF NOT EXISTS public.midterm_subjects (
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

CREATE INDEX IF NOT EXISTS midterm_subjects_class_idx ON public.midterm_subjects(class_name);
CREATE INDEX IF NOT EXISTS midterm_subjects_enabled_idx ON public.midterm_subjects(is_enabled);

-- 3. Student Assessment Marks -----------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_midterm_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.school_students(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id) ON DELETE RESTRICT,
  class_name text NOT NULL,
  subject_id uuid NOT NULL REFERENCES public.midterm_subjects(id) ON DELETE RESTRICT,
  mark numeric(5,2) NOT NULL CHECK (mark >= 0 AND mark <= 100),
  entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_id, subject_id)
);

CREATE INDEX IF NOT EXISTS student_midterm_marks_period_idx ON public.student_midterm_marks(period_id);
CREATE INDEX IF NOT EXISTS student_midterm_marks_class_idx ON public.student_midterm_marks(class_name);
CREATE INDEX IF NOT EXISTS student_midterm_marks_student_idx ON public.student_midterm_marks(student_id);

-- 4. Mark Entry Validation Trigger ------------------------------------------

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

REVOKE ALL ON FUNCTION public.teacher_can_enter_mark(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_can_enter_mark(uuid, text, uuid) TO authenticated;

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

  IF TG_OP = 'UPDATE' AND OLD.period_id IS DISTINCT FROM NEW.period_id THEN
    RAISE EXCEPTION 'Academic marks cannot be moved between mid-term periods.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT p.status INTO v_status FROM public.midterm_periods p WHERE p.id = OLD.period_id FOR SHARE;
  ELSE
    SELECT p.status INTO v_status FROM public.midterm_periods p WHERE p.id = NEW.period_id FOR SHARE;
  END IF;

  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Marks can only be recorded or altered while the mid-term period is open.';
  END IF;

  IF v_role NOT IN ('dean_of_studies', 'teacher', 'it') THEN
    RAISE EXCEPTION 'Current role is unauthorized to alter academic marks.';
  END IF;

  IF v_role = 'teacher' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Teachers cannot delete mark records.';
    END IF;

    IF NOT public.teacher_can_enter_mark(NEW.student_id, NEW.class_name, NEW.subject_id) THEN
      RAISE EXCEPTION 'Teacher is not assigned to this class and subject stream.';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.school_students s
      JOIN public.midterm_subjects sub ON sub.id = NEW.subject_id
      WHERE s.id = NEW.student_id AND s.class_name = NEW.class_name AND sub.class_name = NEW.class_name
    ) THEN
      RAISE EXCEPTION 'Student, class stream, and subject mismatch.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_midterm_mark_before_change ON public.student_midterm_marks;
CREATE TRIGGER validate_midterm_mark_before_change
BEFORE INSERT OR UPDATE OR DELETE ON public.student_midterm_marks
FOR EACH ROW EXECUTE FUNCTION public.validate_midterm_mark();

-- 5. Official Mid-Term Report Cards ----------------------------------------

CREATE TABLE IF NOT EXISTS public.midterm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES public.school_students(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  class_name text NOT NULL,
  average numeric(5,2) NOT NULL DEFAULT 0 CHECK (average >= 0 AND average <= 100),
  rank integer,
  review_status text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('pending', 'approved')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_token text UNIQUE,
  generated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_generated_at timestamptz,
  pdf_storage_path text,
  teacher_comment text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS midterm_reports_period_idx ON public.midterm_reports(period_id);
CREATE INDEX IF NOT EXISTS midterm_reports_class_idx ON public.midterm_reports(class_name);
CREATE INDEX IF NOT EXISTS midterm_reports_token_idx ON public.midterm_reports(access_token);

CREATE TABLE IF NOT EXISTS public.midterm_report_contacts (
  report_id uuid PRIMARY KEY REFERENCES public.midterm_reports(id) ON DELETE CASCADE,
  parent_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.midterm_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  official_date date,
  review_status text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('pending', 'approved', 'extended')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.midterm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. Academic Workflow RPCs -------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_midterm_period(
  p_name text,
  p_official_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administration can create a mid-term period.';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'A period name is required.';
  END IF;

  IF p_official_date IS NULL THEN
    RAISE EXCEPTION 'An official examination date is required.';
  END IF;

  INSERT INTO public.midterm_periods (name, official_date, status, created_by)
  VALUES (trim(p_name), p_official_date, 'open', (SELECT auth.uid()))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_scheduled_midterm_date(
  p_period_id uuid,
  p_official_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administration can change an official date.';
  END IF;

  IF p_official_date IS NULL THEN
    RAISE EXCEPTION 'An official date is required.';
  END IF;

  UPDATE public.midterm_periods
  SET official_date = p_official_date
  WHERE id = p_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_midterm_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administration can open a period.';
  END IF;

  UPDATE public.midterm_periods
  SET status = 'open'
  WHERE id = p_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_midterm_reports(
  p_period_id uuid,
  p_class_name text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_count integer := 0;
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administration can generate reports.';
  END IF;

  SELECT status INTO v_status FROM public.midterm_periods WHERE id = p_period_id FOR SHARE;
  IF NOT FOUND OR v_status NOT IN ('open', 'finalized') THEN
    RAISE EXCEPTION 'Reports can only be generated for an active period.';
  END IF;

  WITH compiled AS (
    SELECT
      s.id AS student_id,
      s.full_name AS student_name,
      s.class_name,
      p_period_id AS period_id,
      round(avg(m.mark), 2) AS average,
      jsonb_agg(
        jsonb_build_object(
          'subject_id', sub.id,
          'subject', sub.subject_name,
          'mark', m.mark,
          'weight', round(m.mark / 10),
          'grade',
            CASE
              WHEN m.mark >= 80 THEN 'A'
              WHEN m.mark >= 70 THEN 'B'
              WHEN m.mark >= 60 THEN 'C'
              WHEN m.mark >= 50 THEN 'D'
              ELSE 'E'
            END
        ) ORDER BY sub.subject_name
      ) AS rows
    FROM public.school_students s
    JOIN public.midterm_subjects sub
      ON sub.class_name = s.class_name AND sub.is_enabled
    JOIN public.student_midterm_marks m
      ON m.student_id = s.id
     AND m.class_name = s.class_name
     AND m.subject_id = sub.id
     AND m.period_id = p_period_id
    WHERE p_class_name IS NULL OR s.class_name = p_class_name
    GROUP BY s.id, s.full_name, s.class_name
  ),
  saved AS (
    INSERT INTO public.midterm_reports (
      student_id,
      student_name,
      class_name,
      period_id,
      average,
      report_data,
      generated_by,
      generated_at,
      review_status,
      access_token
    )
    SELECT
      c.student_id,
      c.student_name,
      c.class_name,
      c.period_id,
      c.average,
      jsonb_build_object('rows', c.rows),
      (SELECT auth.uid()),
      now(),
      'approved',
      encode(gen_random_bytes(16), 'hex')
    FROM compiled c
    ON CONFLICT (id) DO UPDATE SET
      student_name = EXCLUDED.student_name,
      average = EXCLUDED.average,
      report_data = EXCLUDED.report_data,
      generated_at = now()
    RETURNING id, student_id
  )
  SELECT count(*)::integer INTO v_count FROM saved;

  -- Snapshot contact information for generated reports
  INSERT INTO public.midterm_report_contacts (report_id, parent_name, phone, email, captured_at)
  SELECT r.id, COALESCE(s.parent_name, ''), COALESCE(s.phone, ''), COALESCE(s.email, ''), now()
  FROM public.midterm_reports r
  JOIN public.school_students s ON s.id = r.student_id
  WHERE r.period_id = p_period_id
    AND NOT r.is_deleted
    AND (p_class_name IS NULL OR r.class_name = p_class_name)
  ON CONFLICT (report_id) DO UPDATE SET
    parent_name = EXCLUDED.parent_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    captured_at = now();

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_midterm_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administration can finalize a period.';
  END IF;

  UPDATE public.midterm_periods
  SET status = 'finalized',
      finalized_by = (SELECT auth.uid()),
      finalized_at = now()
  WHERE id = p_period_id;
END;
$$;

-- 7. Row-Level Security (RLS) & Permissions ---------------------------------

ALTER TABLE public.midterm_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_midterm_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_report_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.midterm_periods FROM anon, authenticated;
REVOKE ALL ON public.midterm_subjects FROM anon, authenticated;
REVOKE ALL ON public.student_midterm_marks FROM anon, authenticated;
REVOKE ALL ON public.midterm_reports FROM anon, authenticated;
REVOKE ALL ON public.midterm_report_contacts FROM anon, authenticated;
REVOKE ALL ON public.midterm_settings FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.midterm_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_midterm_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_reports TO authenticated;
GRANT SELECT ON public.midterm_report_contacts TO authenticated;
GRANT SELECT, UPDATE ON public.midterm_settings TO authenticated;

-- Policies
CREATE POLICY periods_select_staff ON public.midterm_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY periods_manage_dean_it ON public.midterm_periods FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

CREATE POLICY subjects_select_staff ON public.midterm_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY subjects_manage_dean_it ON public.midterm_subjects FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

CREATE POLICY marks_select_staff ON public.student_midterm_marks FOR SELECT TO authenticated USING (true);
CREATE POLICY marks_write_authorized ON public.student_midterm_marks FOR ALL TO authenticated
  USING (
    public.current_school_role() IN ('dean_of_studies', 'it')
    OR (
      public.current_school_role() = 'teacher'
      AND public.teacher_can_enter_mark(student_id, class_name, subject_id)
    )
  )
  WITH CHECK (
    public.current_school_role() IN ('dean_of_studies', 'it')
    OR (
      public.current_school_role() = 'teacher'
      AND public.teacher_can_enter_mark(student_id, class_name, subject_id)
    )
  );

CREATE POLICY reports_select_staff ON public.midterm_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY reports_manage_dean_it ON public.midterm_reports FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

CREATE POLICY report_contacts_select_leadership ON public.midterm_report_contacts FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

CREATE POLICY settings_select_staff ON public.midterm_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_manage_leadership ON public.midterm_settings FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

GRANT EXECUTE ON FUNCTION public.create_midterm_period(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_scheduled_midterm_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_midterm_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_midterm_reports(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_midterm_period(uuid) TO authenticated;

COMMIT;
