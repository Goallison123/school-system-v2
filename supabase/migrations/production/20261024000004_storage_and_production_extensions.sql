-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Storage & Workflow Extensions (04 of 04)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: Storage Buckets, Storage Object RLS, Assessment Constraints,
--        Token RPCs, and expired-token cleanup
-- Generated to run after Master Production Schema (dhiruneqrgdrlqmsmmhx)
--
-- IMPORTANT:
--   1. Run the storage.objects policy statements as a role that owns
--      storage.objects. This script does not change ownership of that
--      Supabase-managed table.
--   2. RLS is managed by Supabase for Storage. This script does not ALTER
--      storage.objects to enable RLS.
--   3. This script assumes pgcrypto's gen_random_bytes() and digest()
--      functions are installed in the "extensions" schema. If pgcrypto is
--      installed in another schema, adjust those two-part function names.
--   4. Expired Storage files must be removed through the Storage API or an
--      Edge Function; the SQL cleanup function below does not delete files.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. STORAGE BUCKET PROVISIONING
-- ============================================================================

-- Private bucket for student PDF report cards.
-- Maximum object size: 5 MB. Allowed MIME type: application/pdf.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'midterm-reports',
  'midterm-reports',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public bucket for school website images.
-- Maximum object size: 10 MB. Allowed MIME types are web image formats.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'school-media',
  'school-media',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. STORAGE OBJECT RLS POLICIES
-- ============================================================================
-- These DROP/CREATE POLICY statements require ownership-level permission on
-- storage.objects. Supabase public buckets provide public object downloads
-- without a broad public SELECT policy; avoid granting public object listing
-- unless that is explicitly intended.
-- ============================================================================

-- Remove the old policies so this section can be rerun.
DROP POLICY IF EXISTS storage_midterm_reports_select ON storage.objects;
DROP POLICY IF EXISTS storage_midterm_reports_insert ON storage.objects;
DROP POLICY IF EXISTS storage_midterm_reports_modify ON storage.objects;
DROP POLICY IF EXISTS storage_midterm_reports_update ON storage.objects;
DROP POLICY IF EXISTS storage_midterm_reports_delete ON storage.objects;
DROP POLICY IF EXISTS storage_school_media_public_select ON storage.objects;
DROP POLICY IF EXISTS storage_school_media_manage ON storage.objects;

-- Authorized school staff can read report-card objects in the private bucket.
CREATE POLICY storage_midterm_reports_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'midterm-reports'
  AND public.current_school_role() IN (
    'dean_of_studies',
    'headteacher',
    'it',
    'teacher'
  )
);

-- Dean of Studies, Headteacher, and IT can upload report-card PDFs.
CREATE POLICY storage_midterm_reports_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'midterm-reports'
  AND public.current_school_role() IN (
    'dean_of_studies',
    'headteacher',
    'it'
  )
);

-- Dean of Studies and IT can update report-card objects.
-- UPDATE has both USING (existing row) and WITH CHECK (new row) conditions.
CREATE POLICY storage_midterm_reports_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'midterm-reports'
  AND public.current_school_role() IN ('dean_of_studies', 'it')
)
WITH CHECK (
  bucket_id = 'midterm-reports'
  AND public.current_school_role() IN ('dean_of_studies', 'it')
);

-- Dean of Studies and IT can delete report-card objects.
CREATE POLICY storage_midterm_reports_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'midterm-reports'
  AND public.current_school_role() IN ('dean_of_studies', 'it')
);

-- Intentionally no public SELECT policy for school-media.
-- The bucket is public, so public object downloads do not require this policy.
-- This avoids granting anonymous users permission to list bucket contents.

-- Dean of Studies and IT can manage school-media objects.
-- This permits those roles to read/list, upload, update, and delete objects.
CREATE POLICY storage_school_media_manage
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'school-media'
  AND public.current_school_role() IN ('dean_of_studies', 'it')
)
WITH CHECK (
  bucket_id = 'school-media'
  AND public.current_school_role() IN ('dean_of_studies', 'it')
);

-- ============================================================================
-- 3. MARKS UPSERT UNIQUE CONSTRAINT
-- ============================================================================
-- Required for frontend upserts using:
--   onConflict: 'period_id,student_id,subject_id'
--
-- If duplicate data already exists for these columns, adding this constraint
-- will fail; resolve those duplicates before running this migration.
--
-- The constraint creates its own unique index, so a second unique index on
-- the same columns is intentionally not created.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_midterm_marks'::regclass
      AND conname = 'student_midterm_marks_period_student_subject_key'
      AND contype = 'u'
  ) THEN
    ALTER TABLE public.student_midterm_marks
      ADD CONSTRAINT student_midterm_marks_period_student_subject_key
      UNIQUE (period_id, student_id, subject_id);
  END IF;
END
$$;

-- Enforce one active report card per student and period.
-- The partial index permits multiple soft-deleted reports.
CREATE UNIQUE INDEX IF NOT EXISTS midterm_reports_period_student_active_uidx
  ON public.midterm_reports (period_id, student_id)
  WHERE is_deleted = false;

-- ============================================================================
-- 4. WORKSPACE SETTINGS SINGLETON SEED
-- ============================================================================

INSERT INTO public.workspace_settings (
  id,
  admin_name,
  default_notification_channel
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'GS Gacuba 2A Administration',
  'SMS'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. PARENT ACCESS TOKEN ISSUANCE & VERIFICATION RPCS
-- ============================================================================

-- Issue 7-day tokens for existing, non-deleted report cards.
-- Only return a token if the report row was actually updated.
CREATE OR REPLACE FUNCTION public.issue_midterm_report_tokens(
  p_report_ids uuid[]
)
RETURNS TABLE (
  report_id uuid,
  token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_updated_id uuid;
  v_raw_token text;
  v_hash text;
  v_exp timestamptz;
  v_role text;
BEGIN
  v_role := public.current_school_role();

  -- Explicitly reject NULL roles; a NULL value would not satisfy NOT IN.
  IF v_role IS NULL
     OR v_role NOT IN ('dean_of_studies', 'headteacher', 'it') THEN
    RAISE EXCEPTION 'Only school administrators can issue report access tokens'
      USING ERRCODE = '42501';
  END IF;

  v_exp := pg_catalog.now() + interval '7 days';

  FOREACH v_id IN ARRAY p_report_ids
  LOOP
    -- Generate a cryptographically random token and store only its SHA-256
    -- digest. The raw token is returned to the caller and is not stored.
    v_raw_token := pg_catalog.encode(
      extensions.gen_random_bytes(24),
      'hex'
    );

    v_hash := pg_catalog.encode(
      extensions.digest(v_raw_token, 'sha256'),
      'hex'
    );

    UPDATE public.midterm_reports
    SET
      access_token_hash = v_hash,
      access_token_expires_at = v_exp
    WHERE id = v_id
      AND is_deleted = false
    RETURNING id INTO v_updated_id;

    -- Do not return a token that was not saved to a matching report row.
    IF FOUND THEN
      report_id := v_updated_id;
      token := v_raw_token;
      expires_at := v_exp;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Verify a parent token without exposing the stored hash.
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
  -- Treat a missing token as invalid.
  IF p_raw_token IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    access_token_hash,
    access_token_expires_at
  INTO
    v_expected_hash,
    v_expires_at
  FROM public.midterm_reports
  WHERE id = p_report_id
    AND is_deleted = false;

  IF v_expected_hash IS NULL
     OR v_expires_at IS NULL
     OR v_expires_at < pg_catalog.now() THEN
    RETURN false;
  END IF;

  v_provided_hash := pg_catalog.encode(
    extensions.digest(p_raw_token, 'sha256'),
    'hex'
  );

  RETURN v_expected_hash = v_provided_hash;
END;
$$;

-- ============================================================================
-- 6. EXPIRED TOKEN CLEANUP
-- ============================================================================
-- This invalidates expired tokens but does NOT delete Storage objects.
-- pdf_storage_path is intentionally preserved so a separate Storage API or
-- Edge Function cleanup process can use the path to delete the actual object.
-- The return value is the number of report rows whose token hash was cleared.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_midterm_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_role text;
BEGIN
  v_role := public.current_school_role();

  IF v_role IS NULL
     OR v_role NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only dean of studies or IT administrator can run cleanup'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.midterm_reports
  SET access_token_hash = NULL
  WHERE access_token_hash IS NOT NULL
    AND access_token_expires_at IS NOT NULL
    AND access_token_expires_at < pg_catalog.now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 7. FUNCTION EXECUTE PERMISSIONS
-- ============================================================================

-- Revoke default and previously assigned access, then grant only the intended
-- execution permissions.
REVOKE ALL
  ON FUNCTION public.issue_midterm_report_tokens(uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.issue_midterm_report_tokens(uuid[])
  TO authenticated;

REVOKE ALL
  ON FUNCTION public.verify_parent_report_token(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.verify_parent_report_token(uuid, text)
  TO anon, authenticated;

REVOKE ALL
  ON FUNCTION public.cleanup_expired_midterm_reports()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.cleanup_expired_midterm_reports()
  TO authenticated;

COMMIT;