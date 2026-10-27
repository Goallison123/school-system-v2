-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Core Migration (02 of 03)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: Mid-Term Academic Engine, Periods, Subjects, Marks, Reports, Parent Queue & RPCs
-- Generated to match live Supabase project schema: dhiruneqrgdrlqmsmmhx
-- ============================================================================

BEGIN;

-- 1. Mid-Term Periods -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.midterm_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  official_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'open'::text, 'finalized'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finalized_by uuid,
  finalized_at timestamp with time zone,
  CONSTRAINT midterm_periods_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT midterm_periods_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS midterm_periods_status_idx ON public.midterm_periods(status);
CREATE INDEX IF NOT EXISTS midterm_periods_date_idx ON public.midterm_periods(official_date DESC);

-- 2. Curriculum & Subject Offerings -----------------------------------------
CREATE TABLE IF NOT EXISTS public.midterm_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_name text NOT NULL CHECK (length(TRIM(BOTH FROM class_name)) > 0),
  subject_name text NOT NULL CHECK (length(TRIM(BOTH FROM subject_name)) > 0),
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT midterm_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_subjects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS midterm_subjects_class_subject_idx ON public.midterm_subjects(class_name, subject_name);
CREATE INDEX IF NOT EXISTS midterm_subjects_class_idx ON public.midterm_subjects(class_name);
CREATE INDEX IF NOT EXISTS midterm_subjects_enabled_idx ON public.midterm_subjects(is_enabled);

-- 3. Academic Midterm Settings ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.midterm_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  official_date date,
  review_status text NOT NULL DEFAULT 'pending'::text CHECK (review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'extended'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT midterm_settings_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_settings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT midterm_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed singleton settings record if missing
INSERT INTO public.midterm_settings (id, official_date, review_status)
VALUES (1, CURRENT_DATE, 'pending')
ON CONFLICT (id) DO NOTHING;

-- 4. Student Assessment Marks -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_midterm_marks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  class_name text NOT NULL,
  period text CHECK (length(TRIM(BOTH FROM period)) > 0),
  subject_id uuid NOT NULL,
  mark numeric NOT NULL CHECK (mark >= 0::numeric AND mark <= 100::numeric),
  entered_by uuid,
  entered_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  period_id uuid,
  CONSTRAINT student_midterm_marks_pkey PRIMARY KEY (id),
  CONSTRAINT student_midterm_marks_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_midterm_marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.school_students(id) ON DELETE CASCADE,
  CONSTRAINT student_midterm_marks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.midterm_subjects(id) ON DELETE RESTRICT,
  CONSTRAINT student_midterm_marks_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.midterm_periods(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS student_midterm_marks_period_idx ON public.student_midterm_marks(period_id);
CREATE INDEX IF NOT EXISTS student_midterm_marks_class_idx ON public.student_midterm_marks(class_name);
CREATE INDEX IF NOT EXISTS student_midterm_marks_student_idx ON public.student_midterm_marks(student_id);
CREATE INDEX IF NOT EXISTS student_midterm_marks_subject_idx ON public.student_midterm_marks(subject_id);

-- 5. Consolidated Mid-Term Report Cards -------------------------------------
CREATE TABLE IF NOT EXISTS public.midterm_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  student_name text NOT NULL,
  class_name text NOT NULL,
  period text,
  average numeric NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'pending'::text CHECK (review_status = ANY (ARRAY['pending'::text, 'approved'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_by uuid,
  deleted_at timestamp with time zone,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  pdf_generated_at timestamp with time zone,
  pdf_storage_path text,
  teacher_comment text NOT NULL DEFAULT ''::text,
  period_id uuid,
  access_token_hash text,
  access_token_expires_at timestamp with time zone,
  published_at timestamp with time zone,
  CONSTRAINT midterm_reports_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_reports_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.school_students(id) ON DELETE SET NULL,
  CONSTRAINT midterm_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT midterm_reports_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT midterm_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT midterm_reports_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.midterm_periods(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS midterm_reports_period_idx ON public.midterm_reports(period_id);
CREATE INDEX IF NOT EXISTS midterm_reports_class_idx ON public.midterm_reports(class_name);
CREATE INDEX IF NOT EXISTS midterm_reports_student_idx ON public.midterm_reports(student_id);
CREATE INDEX IF NOT EXISTS midterm_reports_review_idx ON public.midterm_reports(review_status);
CREATE INDEX IF NOT EXISTS midterm_reports_token_hash_idx ON public.midterm_reports(access_token_hash);

-- Captured Parent Contact Information for Mid-Term Reports
CREATE TABLE IF NOT EXISTS public.midterm_report_contacts (
  report_id uuid NOT NULL,
  parent_name text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  email text NOT NULL DEFAULT ''::text,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT midterm_report_contacts_pkey PRIMARY KEY (report_id),
  CONSTRAINT midterm_report_contacts_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.midterm_reports(id) ON DELETE CASCADE
);

-- Parent Notification Dispatch Queue (Asynchronous SMS/Email dispatch)
CREATE TABLE IF NOT EXISTS public.midterm_parent_notification_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text])),
  recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text])),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  provider_message_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone,
  CONSTRAINT midterm_parent_notification_queue_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_parent_notification_queue_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.midterm_reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS midterm_queue_status_idx ON public.midterm_parent_notification_queue(status);
CREATE INDEX IF NOT EXISTS midterm_queue_report_idx ON public.midterm_parent_notification_queue(report_id);

-- 6. Stored Procedures & Business Logic --------------------------------------

CREATE OR REPLACE FUNCTION public.set_midterm_report_pdf_metadata(
  p_report_id uuid,
  p_storage_path text,
  p_token_hash text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT (now() + interval '7 days')
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'headteacher', 'it') THEN
    RAISE EXCEPTION 'Unauthorized to register report card PDF artifacts' USING ERRCODE = '42501';
  END IF;

  UPDATE public.midterm_reports
  SET
    pdf_storage_path = p_storage_path,
    pdf_generated_at = now(),
    access_token_hash = COALESCE(p_token_hash, access_token_hash),
    access_token_expires_at = COALESCE(p_expires_at, access_token_expires_at)
  WHERE id = p_report_id;

  RETURN FOUND;
END;
$$;

-- 7. Row-Level Security (RLS) & Policies ------------------------------------

ALTER TABLE public.midterm_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_midterm_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_report_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_parent_notification_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.midterm_periods FROM anon, authenticated;
REVOKE ALL ON public.midterm_subjects FROM anon, authenticated;
REVOKE ALL ON public.midterm_settings FROM anon, authenticated;
REVOKE ALL ON public.student_midterm_marks FROM anon, authenticated;
REVOKE ALL ON public.midterm_reports FROM anon, authenticated;
REVOKE ALL ON public.midterm_report_contacts FROM anon, authenticated;
REVOKE ALL ON public.midterm_parent_notification_queue FROM anon, authenticated;

GRANT SELECT ON public.midterm_periods TO authenticated;
GRANT INSERT, UPDATE ON public.midterm_periods TO authenticated;
GRANT SELECT ON public.midterm_subjects TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.midterm_subjects TO authenticated;
GRANT SELECT, UPDATE ON public.midterm_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_midterm_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_report_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_parent_notification_queue TO authenticated;

-- Mid-Term Periods Policies
CREATE POLICY periods_select ON public.midterm_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY periods_write_dean_or_it ON public.midterm_periods FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Subjects Policies
CREATE POLICY subjects_select ON public.midterm_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY subjects_write_dean_or_it ON public.midterm_subjects FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Settings Policies
CREATE POLICY settings_select ON public.midterm_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_write_dean_or_head ON public.midterm_settings FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher'));

-- Student Marks Policies
CREATE POLICY marks_select ON public.student_midterm_marks FOR SELECT TO authenticated
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

CREATE POLICY marks_write_dean ON public.student_midterm_marks FOR ALL TO authenticated
  USING (public.current_school_role() = 'dean_of_studies')
  WITH CHECK (public.current_school_role() = 'dean_of_studies');

CREATE POLICY marks_insert_teacher ON public.student_midterm_marks FOR INSERT TO authenticated
  WITH CHECK (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = student_midterm_marks.class_name
    )
  );

CREATE POLICY marks_update_teacher ON public.student_midterm_marks FOR UPDATE TO authenticated
  USING (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = student_midterm_marks.class_name
    )
  )
  WITH CHECK (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = student_midterm_marks.class_name
    )
  );

-- Midterm Reports Policies
CREATE POLICY reports_select ON public.midterm_reports FOR SELECT TO authenticated
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

CREATE POLICY reports_write_dean_or_head ON public.midterm_reports FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher'));

-- Report Contacts Policies
CREATE POLICY report_contacts_select ON public.midterm_report_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY report_contacts_write ON public.midterm_report_contacts FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Parent Queue Policies
CREATE POLICY queue_select ON public.midterm_parent_notification_queue FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));
CREATE POLICY queue_write ON public.midterm_parent_notification_queue FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

GRANT EXECUTE ON FUNCTION public.set_midterm_report_pdf_metadata(uuid, text, text, timestamptz) TO authenticated;

COMMIT;
