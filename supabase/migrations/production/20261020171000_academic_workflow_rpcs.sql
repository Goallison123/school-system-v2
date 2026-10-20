
-- Requires 20261020170000_production_core.sql to be applied first.
-- All academic workflow actions are authorized in the database.

BEGIN;

-- One active report per student per period.
CREATE UNIQUE INDEX midterm_reports_one_active_student_period
ON public.midterm_reports(student_id, period_id)
WHERE student_id IS NOT NULL AND is_deleted = false;

-- Create a period. It starts scheduled and is not automatically opened.
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
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can create academic periods.';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL OR p_official_date IS NULL THEN
    RAISE EXCEPTION 'A period name and official date are required.';
  END IF;

  INSERT INTO public.midterm_periods (name, official_date, created_by)
  VALUES (trim(p_name), p_official_date, (SELECT auth.uid()))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Change a scheduled period's date. Once open, its date cannot be changed
-- through this RPC. Use a separate documented extension workflow if needed.
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
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can change an official date.';
  END IF;

  IF p_official_date IS NULL THEN
    RAISE EXCEPTION 'An official date is required.';
  END IF;

  UPDATE public.midterm_periods
  SET official_date = p_official_date
  WHERE id = p_period_id
    AND status = 'scheduled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period not found or no longer scheduled.';
  END IF;
END;
$$;

-- Explicitly open a scheduled period for mark entry.
CREATE OR REPLACE FUNCTION public.open_midterm_period(
  p_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can open a period.';
  END IF;

  SELECT status INTO v_status
  FROM public.midterm_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period not found.';
  END IF;

  IF v_status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled period can be opened.';
  END IF;

  UPDATE public.midterm_periods
  SET status = 'open'
  WHERE id = p_period_id;
END;
$$;

-- Generate or refresh pending reports for a period.
-- Optional class filter limits generation to one class.
-- This operation NEVER finalizes the period.
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
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can generate reports.';
  END IF;

  SELECT status INTO v_status
  FROM public.midterm_periods
  WHERE id = p_period_id
  FOR SHARE;

  IF NOT FOUND OR v_status <> 'open' THEN
    RAISE EXCEPTION 'Reports can only be generated for an open period.';
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
      ON sub.class_name = s.class_name
     AND sub.is_enabled
    JOIN public.student_midterm_marks m
      ON m.student_id = s.id
     AND m.class_name = s.class_name
     AND m.subject_id = sub.id
     AND m.period_id = p_period_id
    WHERE p_class_name IS NULL OR s.class_name = p_class_name
    GROUP BY s.id, s.full_name, s.class_name
    HAVING count(DISTINCT sub.id) =
           (
             SELECT count(*)
             FROM public.midterm_subjects required
             WHERE required.class_name = s.class_name
               AND required.is_enabled
           )
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
      review_status
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
      'pending'
    FROM compiled c
    ON CONFLICT (student_id, period_id)
      WHERE student_id IS NOT NULL AND is_deleted = false
    DO UPDATE SET
      student_name = EXCLUDED.student_name,
      class_name = EXCLUDED.class_name,
      average = EXCLUDED.average,
      report_data = EXCLUDED.report_data,
      generated_by = EXCLUDED.generated_by,
      generated_at = now(),
      pdf_generated_at = NULL,
      pdf_storage_path = NULL,
      teacher_comment = ''
    WHERE midterm_reports.review_status = 'pending'
      AND midterm_reports.is_deleted = false
    RETURNING id, student_id
  )
  SELECT count(*)::integer INTO v_count FROM saved;

  -- Snapshot parent contact details for generated reports.
  INSERT INTO public.midterm_report_contacts (
    report_id, parent_name, phone, email, captured_at
  )
  SELECT
    r.id,
    COALESCE(s.parent_name, ''),
    COALESCE(s.phone, ''),
    COALESCE(s.email, ''),
    now()
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

-- Approve a pending report. Approval does not finalize the period.
CREATE OR REPLACE FUNCTION public.approve_midterm_report(
  p_report_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can approve reports.';
  END IF;

  SELECT p.status INTO v_status
  FROM public.midterm_reports r
  JOIN public.midterm_periods p ON p.id = r.period_id
  WHERE r.id = p_report_id
    AND NOT r.is_deleted
  FOR SHARE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.';
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Reports can only be approved while the period is open.';
  END IF;

  UPDATE public.midterm_reports
  SET review_status = 'approved',
      reviewed_by = (SELECT auth.uid()),
      reviewed_at = now()
  WHERE id = p_report_id
    AND review_status = 'pending'
    AND NOT is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report is already approved or unavailable.';
  END IF;
END;
$$;

-- Finalization is an explicit, irreversible action.
CREATE OR REPLACE FUNCTION public.finalize_midterm_period(
  p_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.current_school_role() <> 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can finalize a period.';
  END IF;

  SELECT status INTO v_status
  FROM public.midterm_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period not found.';
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Only an open period can be finalized.';
  END IF;

  UPDATE public.midterm_periods
  SET status = 'finalized',
      finalized_by = (SELECT auth.uid()),
      finalized_at = now()
  WHERE id = p_period_id;
END;
$$;

-- Clients can invoke the RPCs, but each function independently checks role.
REVOKE ALL ON FUNCTION public.create_midterm_period(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_scheduled_midterm_date(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_midterm_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_midterm_reports(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_midterm_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_midterm_period(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_midterm_period(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_scheduled_midterm_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_midterm_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_midterm_reports(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_midterm_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_midterm_period(uuid) TO authenticated;

COMMIT;
