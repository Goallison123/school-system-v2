-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Storage & Workflow Extensions (04 of 04)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: Storage Buckets, Storage Object RLS, Assessment Constraints, Token RPCs & 7-Day Purge
-- Generated to safely run after Master Production Schema (dhiruneqrgdrlqmsmmhx)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. STORAGE BUCKETS PROVISIONING
-- ============================================================================
-- Bucket 1: 'midterm-reports' (Private storage for student PDF report cards)
-- Strict 5MB size limit, restricted exclusively to application/pdf
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'midterm-reports',
  'midterm-reports',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket 2: 'school-media' (Public storage for school CMS, gallery & announcements)
-- 10MB size limit, restricted to web image formats
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-media',
  'school-media',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. STORAGE OBJECT ROW-LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Midterm Reports Bucket: Authorized staff can view PDF report cards
DROP POLICY IF EXISTS storage_midterm_reports_select ON storage.objects;
CREATE POLICY storage_midterm_reports_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'midterm-reports'
    AND (
      public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
      OR public.current_school_role() = 'teacher'
    )
  );

-- Midterm Reports Bucket: Only Dean of Studies, Headteacher, or IT can upload PDF cards
DROP POLICY IF EXISTS storage_midterm_reports_insert ON storage.objects;
CREATE POLICY storage_midterm_reports_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'midterm-reports'
    AND public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  );

-- Midterm Reports Bucket: Only Dean of Studies or IT can modify or delete PDF cards
DROP POLICY IF EXISTS storage_midterm_reports_modify ON storage.objects;
CREATE POLICY storage_midterm_reports_modify ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'midterm-reports'
    AND public.current_school_role() IN ('dean_of_studies', 'it')
  )
  WITH CHECK (
    bucket_id = 'midterm-reports'
    AND public.current_school_role() IN ('dean_of_studies', 'it')
  );

-- School Media Bucket: Public read access for published images and website showcases
DROP POLICY IF EXISTS storage_school_media_public_select ON storage.objects;
CREATE POLICY storage_school_media_public_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'school-media');

-- School Media Bucket: Dean of Studies and IT administrator manage gallery/news images
DROP POLICY IF EXISTS storage_school_media_manage ON storage.objects;
CREATE POLICY storage_school_media_manage ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'school-media'
    AND public.current_school_role() IN ('dean_of_studies', 'it')
  )
  WITH CHECK (
    bucket_id = 'school-media'
    AND public.current_school_role() IN ('dean_of_studies', 'it')
  );

-- ============================================================================
-- 3. CRUCIAL MARKS UPSERT UNIQUE CONSTRAINT
-- ============================================================================
-- Required by React Frontend: upsert({ ... }, { onConflict: 'period_id,student_id,subject_id' })
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_midterm_marks_period_student_subject_key'
  ) THEN
    ALTER TABLE public.student_midterm_marks
      ADD CONSTRAINT student_midterm_marks_period_student_subject_key
      UNIQUE (period_id, student_id, subject_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS student_midterm_marks_period_student_subject_uidx
  ON public.student_midterm_marks (period_id, student_id, subject_id);

-- Enforce uniqueness of active report cards per student and period
CREATE UNIQUE INDEX IF NOT EXISTS midterm_reports_period_student_active_uidx
  ON public.midterm_reports (period_id, student_id)
  WHERE is_deleted = false;

-- ============================================================================
-- 4. WORKSPACE SETTINGS SINGLETON SEED
-- ============================================================================
INSERT INTO public.workspace_settings (id, admin_name, default_notification_channel)
VALUES ('00000000-0000-0000-0000-000000000001', 'GS Gacuba 2A Administration', 'SMS')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. PARENT ACCESS TOKEN ISSUANCE & VERIFICATION RPCS
-- ============================================================================
-- Issue secure randomized parent verification tokens for report cards
CREATE OR REPLACE FUNCTION public.issue_midterm_report_tokens(p_report_ids uuid[])
RETURNS TABLE (report_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_raw_token text;
  v_hash text;
  v_exp timestamptz;
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'headteacher', 'it') THEN
    RAISE EXCEPTION 'Only school administrators can issue report access tokens' USING ERRCODE = '42501';
  END IF;

  v_exp := now() + interval '7 days';

  FOREACH v_id IN ARRAY p_report_ids
  LOOP
    v_raw_token := encode(gen_random_bytes(24), 'hex');
    v_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    UPDATE public.midterm_reports
    SET
      access_token_hash = v_hash,
      access_token_expires_at = v_exp
    WHERE id = v_id;

    report_id := v_id;
    token := v_raw_token;
    expires_at := v_exp;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Verify parent report access token without exposing token hashes to client
CREATE OR REPLACE FUNCTION public.verify_parent_report_token(
  p_report_id uuid,
  p_raw_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_hash text;
  v_expires_at timestamptz;
  v_provided_hash text;
BEGIN
  SELECT access_token_hash, access_token_expires_at
  INTO v_expected_hash, v_expires_at
  FROM public.midterm_reports
  WHERE id = p_report_id AND is_deleted = false;

  IF v_expected_hash IS NULL OR v_expires_at IS NULL THEN
    RETURN false;
  END IF;

  IF v_expires_at < now() THEN
    RETURN false;
  END IF;

  v_provided_hash := encode(digest(p_raw_token, 'sha256'), 'hex');
  RETURN (v_expected_hash = v_provided_hash);
END;
$$;

-- ============================================================================
-- 6. 7-DAY RETENTION & STORAGE CLEANUP RPC
-- ============================================================================
-- Keeps storage within the 500MB tier by clearing expired artifacts
CREATE OR REPLACE FUNCTION public.cleanup_expired_midterm_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only dean of studies or IT administrator can run cleanup' USING ERRCODE = '42501';
  END IF;

  UPDATE public.midterm_reports
  SET
    access_token_hash = NULL,
    pdf_storage_path = NULL
  WHERE access_token_expires_at IS NOT NULL
    AND access_token_expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 7. FUNCTION GRANTS
-- ============================================================================
REVOKE ALL ON FUNCTION public.issue_midterm_report_tokens(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_midterm_report_tokens(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_parent_report_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_parent_report_token(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cleanup_expired_midterm_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_midterm_reports() TO authenticated;

COMMIT;
