-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Master Production Database Schema
-- Architecture: Supabase PostgreSQL 15 | Strict Row-Level Security
-- Verified & Aligned with Live Supabase Project DDL (21 Production Tables)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CORE EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. ROLE ENUMERATION
-- ============================================================================
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

-- ============================================================================
-- 3. USERS (STAFF PROFILES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT ''::text,
  role public.school_role NOT NULL DEFAULT 'teacher'::public.school_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);

-- Current user role evaluator function for RLS
CREATE OR REPLACE FUNCTION public.current_school_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT u.role::text FROM public.users u WHERE u.id = (SELECT auth.uid())),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.current_school_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_school_role() TO authenticated;

-- Automatic profile sync trigger from auth.users
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
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN length(EXCLUDED.full_name) > 0 THEN EXCLUDED.full_name ELSE users.full_name END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

-- ============================================================================
-- 4. WORKSPACE SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_name text NOT NULL DEFAULT 'Administrator'::text,
  default_notification_channel text NOT NULL DEFAULT 'SMS'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspace_settings_pkey PRIMARY KEY (id)
);

-- Seed singleton settings record if missing
INSERT INTO public.workspace_settings (id, admin_name, default_notification_channel)
VALUES ('00000000-0000-0000-0000-000000000001', 'GS Gacuba 2A Administration', 'SMS')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. STUDENT INFORMATION SYSTEM (SIS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.school_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  parent_name text NOT NULL DEFAULT 'Not provided'::text,
  email text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  class_name text NOT NULL,
  fee_status text NOT NULL DEFAULT 'Unpaid'::text CHECK (fee_status = ANY (ARRAY['Paid'::text, 'Partial'::text, 'Unpaid'::text])),
  fee_amount text NOT NULL DEFAULT '0 RWF'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stream text NOT NULL DEFAULT ''::text,
  registration_number text NOT NULL,
  CONSTRAINT school_students_pkey PRIMARY KEY (id)
);

-- NOT VALID check constraints matching live Supabase project
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_students_parent_name_check') THEN
    ALTER TABLE public.school_students
      ADD CONSTRAINT school_students_parent_name_check
      CHECK (length(TRIM(BOTH FROM parent_name)) > 0 AND lower(TRIM(BOTH FROM parent_name)) <> 'not provided'::text) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_students_email_check') THEN
    ALTER TABLE public.school_students
      ADD CONSTRAINT school_students_email_check
      CHECK (email = '' OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_students_phone_check') THEN
    ALTER TABLE public.school_students
      ADD CONSTRAINT school_students_phone_check
      CHECK (phone = '' OR length(regexp_replace(phone, '[^0-9]'::text, ''::text, 'g'::text)) >= 8) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_students_stream_check') THEN
    ALTER TABLE public.school_students
      ADD CONSTRAINT school_students_stream_check
      CHECK (length(TRIM(BOTH FROM stream)) > 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS school_students_class_name_idx ON public.school_students(class_name);
CREATE INDEX IF NOT EXISTS school_students_registry_code_idx ON public.school_students(registry_code);
CREATE INDEX IF NOT EXISTS school_students_reg_num_idx ON public.school_students(registration_number);
CREATE INDEX IF NOT EXISTS school_students_fee_status_idx ON public.school_students(fee_status);
CREATE INDEX IF NOT EXISTS school_students_created_at_idx ON public.school_students(created_at DESC);

-- Historical Student Archive (Soft-deletion recovery subsystem)
CREATE TABLE IF NOT EXISTS public.school_students_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  original_id text NOT NULL,
  registry_code text,
  registration_number text,
  full_name text,
  parent_name text,
  email text,
  phone text,
  class_name text,
  stream text,
  fee_status text,
  fee_amount text,
  archived_at timestamp with time zone DEFAULT now(),
  archived_reason text,
  archived_by text,
  original_data jsonb,
  CONSTRAINT school_students_archive_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS school_students_archive_original_id_idx ON public.school_students_archive(original_id);
CREATE INDEX IF NOT EXISTS school_students_archive_class_idx ON public.school_students_archive(class_name);
CREATE INDEX IF NOT EXISTS school_students_archive_archived_at_idx ON public.school_students_archive(archived_at DESC);

-- ============================================================================
-- 6. TEACHER CLASS ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_class_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL,
  class_name text NOT NULL CHECK (length(TRIM(BOTH FROM class_name)) > 0),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teacher_class_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_class_assignments_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teacher_class_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS teacher_class_assignments_class_idx ON public.teacher_class_assignments(class_name);
CREATE INDEX IF NOT EXISTS teacher_class_assignments_teacher_idx ON public.teacher_class_assignments(teacher_user_id);

-- Teacher class register view (Security barrier view filtering assigned students)
CREATE OR REPLACE VIEW public.teacher_student_register WITH (security_barrier = true) AS
SELECT s.id, s.full_name, s.class_name, s.stream
FROM public.school_students s
WHERE EXISTS (
  SELECT 1 FROM public.teacher_class_assignments a
  WHERE a.teacher_user_id = (SELECT auth.uid())
    AND a.class_name = s.class_name
)
OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it');

-- ============================================================================
-- 7. ACADEMIC PERIODS & SUBJECT MATRICES
-- ============================================================================
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

INSERT INTO public.midterm_settings (id, official_date, review_status)
VALUES (1, CURRENT_DATE, 'pending')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. ASSESSMENT MARKS & MID-TERM REPORT CARDS
-- ============================================================================
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

-- Enforce unique student-subject-period mark entry for idempotent upserts
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

-- Unique index to prevent duplicate active reports for the same student in the same period
CREATE UNIQUE INDEX IF NOT EXISTS midterm_reports_period_student_active_uidx
  ON public.midterm_reports(period_id, student_id)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS public.midterm_report_contacts (
  report_id uuid NOT NULL,
  parent_name text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  email text NOT NULL DEFAULT ''::text,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT midterm_report_contacts_pkey PRIMARY KEY (report_id),
  CONSTRAINT midterm_report_contacts_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.midterm_reports(id) ON DELETE CASCADE
);

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

-- ============================================================================
-- 9. COMMUNICATIONS & SMS INFRASTRUCTURE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.school_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_name text NOT NULL,
  student_name text,
  class_name text,
  phone text,
  email text,
  preferred_channel text NOT NULL DEFAULT 'SMS'::text,
  status text NOT NULL DEFAULT 'Active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT school_contacts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS school_contacts_class_idx ON public.school_contacts(class_name);
CREATE INDEX IF NOT EXISTS school_contacts_phone_idx ON public.school_contacts(phone);

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY['SMS'::text],
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft'::text,
  scheduled_for timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  category text DEFAULT 'Parent notification'::text,
  CONSTRAINT notification_campaigns_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS notification_campaigns_created_at_idx ON public.notification_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_campaigns_status_idx ON public.notification_campaigns(status);

CREATE TABLE IF NOT EXISTS public.sms_campaign_dispatches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  campaign_id uuid,
  recipient_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  recipient_count integer,
  CONSTRAINT sms_campaign_dispatches_pkey PRIMARY KEY (id),
  CONSTRAINT sms_campaign_dispatches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS sms_campaign_dispatches_fingerprint_idx ON public.sms_campaign_dispatches(fingerprint);
CREATE INDEX IF NOT EXISTS sms_campaign_dispatches_campaign_idx ON public.sms_campaign_dispatches(campaign_id);

CREATE TABLE IF NOT EXISTS public.midterm_sms_dispatches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  period text NOT NULL,
  campaign_id uuid,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT midterm_sms_dispatches_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_sms_dispatches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS midterm_sms_dispatches_fingerprint_idx ON public.midterm_sms_dispatches(fingerprint);
CREATE INDEX IF NOT EXISTS midterm_sms_dispatches_period_idx ON public.midterm_sms_dispatches(period);

CREATE TABLE IF NOT EXISTS public.midterm_notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_user_id uuid,
  recipient_email text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  delivered_at timestamp with time zone,
  CONSTRAINT midterm_notification_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT midterm_notification_outbox_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS midterm_outbox_created_at_idx ON public.midterm_notification_outbox(created_at DESC);
CREATE INDEX IF NOT EXISTS midterm_outbox_event_type_idx ON public.midterm_notification_outbox(event_type);

-- ============================================================================
-- 10. PUBLIC CMS, INQUIRIES & GALLERY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.school_content (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'News'::text,
  excerpt text,
  image_url text,
  status text NOT NULL DEFAULT 'Draft'::text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  author text DEFAULT 'Administrator'::text,
  category text,
  description text,
  summary text,
  content text[],
  read_time text,
  image text,
  CONSTRAINT school_content_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS school_content_status_idx ON public.school_content(status);
CREATE INDEX IF NOT EXISTS school_content_created_at_idx ON public.school_content(created_at DESC);

CREATE TABLE IF NOT EXISTS public.school_inquiries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  visitor_name text DEFAULT ''::text,
  email text,
  phone text,
  topic text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'New'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  academic_stream text,
  name text,
  CONSTRAINT school_inquiries_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS school_inquiries_status_idx ON public.school_inquiries(status);
CREATE INDEX IF NOT EXISTS school_inquiries_created_at_idx ON public.school_inquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  src text NOT NULL,
  title text,
  category text,
  description text,
  status text DEFAULT 'Published'::text,
  "order" integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gallery_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS gallery_items_status_idx ON public.gallery_items(status);
CREATE INDEX IF NOT EXISTS gallery_items_order_idx ON public.gallery_items("order");

CREATE TABLE IF NOT EXISTS public.news_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  date text,
  category text,
  summary text,
  content text[] DEFAULT ARRAY[]::text[],
  author text,
  read_time text,
  image_url text,
  status text DEFAULT 'Published'::text,
  published_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT news_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS news_items_status_idx ON public.news_items(status);
CREATE INDEX IF NOT EXISTS news_items_published_at_idx ON public.news_items(published_at DESC);

-- ============================================================================
-- 11. RPC STORED PROCEDURES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_school_teachers()
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'headteacher', 'it') THEN
    RAISE EXCEPTION 'Only school administrators can view staff directory' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.full_name, u.email
  FROM public.users AS u
  WHERE u.role = 'teacher'
  ORDER BY NULLIF(trim(u.full_name), ''), u.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_teacher_class_assignments()
RETURNS TABLE (teacher_user_id uuid, teacher_name text, class_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'headteacher', 'it') THEN
    RAISE EXCEPTION 'Only school administrators can view class stream assignments' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.teacher_user_id, teacher.full_name, a.class_name
  FROM public.teacher_class_assignments AS a
  JOIN public.users AS teacher ON teacher.id = a.teacher_user_id
  WHERE teacher.role = 'teacher'
  ORDER BY a.class_name, NULLIF(trim(teacher.full_name), ''), teacher.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_school_students(p_students jsonb)
RETURNS SETOF public.school_students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only the dean of studies or IT administrator can import students.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  INSERT INTO public.school_students (
    registry_code,
    registration_number,
    full_name,
    parent_name,
    email,
    phone,
    class_name,
    stream,
    fee_status,
    fee_amount
  )
  SELECT
    COALESCE(NULLIF(TRIM(elem->>'registry_code'), ''), 'GSC-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6))),
    COALESCE(NULLIF(TRIM(elem->>'registration_number'), ''), NULLIF(TRIM(elem->>'registry_code'), ''), 'GSC-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6))),
    TRIM(elem->>'full_name'),
    COALESCE(NULLIF(TRIM(elem->>'parent_name'), ''), 'Not provided'),
    COALESCE(TRIM(elem->>'email'), ''),
    COALESCE(TRIM(elem->>'phone'), ''),
    TRIM(elem->>'class_name'),
    COALESCE(TRIM(elem->>'stream'), ''),
    CASE 
      WHEN elem->>'fee_status' IN ('Paid', 'Partial', 'Unpaid') THEN elem->>'fee_status'
      ELSE 'Unpaid'
    END,
    COALESCE(TRIM(elem->>'fee_amount'), '0 RWF')
  FROM jsonb_array_elements(p_students) AS elem
  WHERE length(trim(COALESCE(elem->>'full_name', ''))) > 0
    AND length(trim(COALESCE(elem->>'class_name', ''))) > 0
  ON CONFLICT (registry_code) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    parent_name = EXCLUDED.parent_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    class_name = EXCLUDED.class_name,
    stream = EXCLUDED.stream,
    fee_status = EXCLUDED.fee_status,
    fee_amount = EXCLUDED.fee_amount,
    updated_at = now()
  RETURNING *;
END;
$$;

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

-- Function to issue secure parent report tokens
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

-- Function to verify parent report access token
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

-- Function to purge expired report tokens and clear storage paths after 7 days
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
-- 12. STORAGE BUCKETS PROVISIONING
-- ============================================================================
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
-- 13. ROW-LEVEL SECURITY & PERMISSIONS
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_midterm_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_report_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_parent_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_sms_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON public.teacher_student_register FROM PUBLIC;

-- Grants for Public / Anonymous
GRANT SELECT ON public.gallery_items TO anon, authenticated;
GRANT SELECT ON public.news_items TO anon, authenticated;
GRANT SELECT ON public.school_content TO anon, authenticated;
GRANT INSERT ON public.school_inquiries TO anon, authenticated;

-- Grants for Authenticated Users
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_students TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.school_students_archive TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.teacher_class_assignments TO authenticated;
GRANT SELECT ON public.teacher_student_register TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_subjects TO authenticated;
GRANT SELECT, UPDATE ON public.midterm_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_midterm_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_report_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_parent_notification_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_campaign_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_sms_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_notification_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_content TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.school_inquiries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gallery_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news_items TO authenticated;

-- Storage Policies: Midterm Reports Bucket
DROP POLICY IF EXISTS storage_midterm_reports_select ON storage.objects;
CREATE POLICY storage_midterm_reports_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'midterm-reports'
    AND (
      public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
      OR public.current_school_role() = 'teacher'
    )
  );

DROP POLICY IF EXISTS storage_midterm_reports_insert ON storage.objects;
CREATE POLICY storage_midterm_reports_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'midterm-reports'
    AND public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  );

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

-- Storage Policies: School Media Bucket
DROP POLICY IF EXISTS storage_school_media_public_select ON storage.objects;
CREATE POLICY storage_school_media_public_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'school-media');

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

-- Policies: Users
DROP POLICY IF EXISTS users_select_staff ON public.users;
CREATE POLICY users_select_staff ON public.users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS users_update_it ON public.users;
CREATE POLICY users_update_it ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_school_role() = 'it')
  WITH CHECK (id = (SELECT auth.uid()) OR public.current_school_role() = 'it');

-- Policies: Workspace Settings
DROP POLICY IF EXISTS workspace_settings_select ON public.workspace_settings;
CREATE POLICY workspace_settings_select ON public.workspace_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workspace_settings_modify ON public.workspace_settings;
CREATE POLICY workspace_settings_modify ON public.workspace_settings FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: Students
DROP POLICY IF EXISTS students_read_authorized ON public.school_students;
CREATE POLICY students_read_authorized ON public.school_students FOR SELECT TO authenticated
  USING (
    public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
    OR (
      public.current_school_role() = 'teacher'
      AND EXISTS (
        SELECT 1 FROM public.teacher_class_assignments a
        WHERE a.teacher_user_id = (SELECT auth.uid())
          AND a.class_name = school_students.class_name
      )
    )
  );

DROP POLICY IF EXISTS students_write_dean_or_it ON public.school_students;
CREATE POLICY students_write_dean_or_it ON public.school_students FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Student Archive
DROP POLICY IF EXISTS archive_manage_dean_or_it ON public.school_students_archive;
CREATE POLICY archive_manage_dean_or_it ON public.school_students_archive FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Teacher Assignments
DROP POLICY IF EXISTS assignments_read_authorized ON public.teacher_class_assignments;
CREATE POLICY assignments_read_authorized ON public.teacher_class_assignments FOR SELECT TO authenticated
  USING (
    teacher_user_id = (SELECT auth.uid())
    OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  );

DROP POLICY IF EXISTS assignments_manage_dean_or_it ON public.teacher_class_assignments;
CREATE POLICY assignments_manage_dean_or_it ON public.teacher_class_assignments FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Academic Periods
DROP POLICY IF EXISTS periods_select ON public.midterm_periods;
CREATE POLICY periods_select ON public.midterm_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS periods_write_dean_or_it ON public.midterm_periods;
CREATE POLICY periods_write_dean_or_it ON public.midterm_periods FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Academic Subjects
DROP POLICY IF EXISTS subjects_select ON public.midterm_subjects;
CREATE POLICY subjects_select ON public.midterm_subjects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS subjects_write_dean_or_it ON public.midterm_subjects;
CREATE POLICY subjects_write_dean_or_it ON public.midterm_subjects FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Midterm Settings
DROP POLICY IF EXISTS settings_select ON public.midterm_settings;
CREATE POLICY settings_select ON public.midterm_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS settings_write_dean_or_head ON public.midterm_settings;
CREATE POLICY settings_write_dean_or_head ON public.midterm_settings FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher'));

-- Policies: Student Marks
DROP POLICY IF EXISTS marks_select ON public.student_midterm_marks;
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

DROP POLICY IF EXISTS marks_write_dean ON public.student_midterm_marks;
CREATE POLICY marks_write_dean ON public.student_midterm_marks FOR ALL TO authenticated
  USING (public.current_school_role() = 'dean_of_studies')
  WITH CHECK (public.current_school_role() = 'dean_of_studies');

DROP POLICY IF EXISTS marks_insert_teacher ON public.student_midterm_marks;
CREATE POLICY marks_insert_teacher ON public.student_midterm_marks FOR INSERT TO authenticated
  WITH CHECK (
    public.current_school_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_assignments a
      WHERE a.teacher_user_id = (SELECT auth.uid())
        AND a.class_name = student_midterm_marks.class_name
    )
  );

DROP POLICY IF EXISTS marks_update_teacher ON public.student_midterm_marks;
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

-- Policies: Reports
DROP POLICY IF EXISTS reports_select ON public.midterm_reports;
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

DROP POLICY IF EXISTS reports_write_dean_or_head ON public.midterm_reports;
CREATE POLICY reports_write_dean_or_head ON public.midterm_reports FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher'));

-- Policies: Report Contacts
DROP POLICY IF EXISTS report_contacts_select ON public.midterm_report_contacts;
CREATE POLICY report_contacts_select ON public.midterm_report_contacts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS report_contacts_write ON public.midterm_report_contacts;
CREATE POLICY report_contacts_write ON public.midterm_report_contacts FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: Parent Notification Queue
DROP POLICY IF EXISTS queue_select ON public.midterm_parent_notification_queue;
CREATE POLICY queue_select ON public.midterm_parent_notification_queue FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS queue_write ON public.midterm_parent_notification_queue;
CREATE POLICY queue_write ON public.midterm_parent_notification_queue FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: School Contacts
DROP POLICY IF EXISTS contacts_select ON public.school_contacts;
CREATE POLICY contacts_select ON public.school_contacts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contacts_manage ON public.school_contacts;
CREATE POLICY contacts_manage ON public.school_contacts FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: Notification Campaigns
DROP POLICY IF EXISTS campaigns_select ON public.notification_campaigns;
CREATE POLICY campaigns_select ON public.notification_campaigns FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS campaigns_manage ON public.notification_campaigns;
CREATE POLICY campaigns_manage ON public.notification_campaigns FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: SMS Dispatches
DROP POLICY IF EXISTS sms_dispatches_select ON public.sms_campaign_dispatches;
CREATE POLICY sms_dispatches_select ON public.sms_campaign_dispatches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sms_dispatches_insert ON public.sms_campaign_dispatches;
CREATE POLICY sms_dispatches_insert ON public.sms_campaign_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS midterm_dispatches_select ON public.midterm_sms_dispatches;
CREATE POLICY midterm_dispatches_select ON public.midterm_sms_dispatches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS midterm_dispatches_insert ON public.midterm_sms_dispatches;
CREATE POLICY midterm_dispatches_insert ON public.midterm_sms_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: Outbox
DROP POLICY IF EXISTS outbox_select ON public.midterm_notification_outbox;
CREATE POLICY outbox_select ON public.midterm_notification_outbox FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS outbox_insert ON public.midterm_notification_outbox;
CREATE POLICY outbox_insert ON public.midterm_notification_outbox FOR INSERT TO authenticated WITH CHECK (true);

-- Policies: Public CMS Content
DROP POLICY IF EXISTS content_public_read ON public.school_content;
CREATE POLICY content_public_read ON public.school_content FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS content_manage ON public.school_content;
CREATE POLICY content_manage ON public.school_content FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: Inquiries
DROP POLICY IF EXISTS inquiries_public_insert ON public.school_inquiries;
CREATE POLICY inquiries_public_insert ON public.school_inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS inquiries_staff_manage ON public.school_inquiries;
CREATE POLICY inquiries_staff_manage ON public.school_inquiries FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Policies: Gallery
DROP POLICY IF EXISTS gallery_public_read ON public.gallery_items;
CREATE POLICY gallery_public_read ON public.gallery_items FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS gallery_manage ON public.gallery_items;
CREATE POLICY gallery_manage ON public.gallery_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Policies: News
DROP POLICY IF EXISTS news_public_read ON public.news_items;
CREATE POLICY news_public_read ON public.news_items FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

DROP POLICY IF EXISTS news_manage ON public.news_items;
CREATE POLICY news_manage ON public.news_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Function Grants
GRANT EXECUTE ON FUNCTION public.list_school_teachers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_class_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_school_students(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_midterm_report_pdf_metadata(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_midterm_report_tokens(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_parent_report_token(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_midterm_reports() TO authenticated;

COMMIT;
