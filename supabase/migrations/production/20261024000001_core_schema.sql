-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Core Migration (01 of 03)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: Roles, User Profiles, SIS Registry, Archive Subsystem, Staff Assignments
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Role System (Strict 4 Roles) -------------------------------------------

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

-- 2. User Profiles & Role Evaluation ----------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role public.school_role NOT NULL DEFAULT 'teacher',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);

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

-- Automatic user profile creation on signup
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

-- 3. Student Information System (SIS) ---------------------------------------

CREATE TABLE IF NOT EXISTS public.school_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_code text NOT NULL UNIQUE,
  registration_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  parent_name text NOT NULL DEFAULT 'Not provided',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  class_name text NOT NULL,
  stream text NOT NULL DEFAULT 'General',
  fee_status text NOT NULL DEFAULT 'Unpaid' CHECK (fee_status IN ('Paid', 'Partial', 'Unpaid')),
  fee_amount text NOT NULL DEFAULT '0 RWF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_students_name_nonempty CHECK (length(trim(full_name)) > 0),
  CONSTRAINT school_students_class_nonempty CHECK (length(trim(class_name)) > 0)
);

CREATE INDEX IF NOT EXISTS school_students_class_name_idx ON public.school_students(class_name);
CREATE INDEX IF NOT EXISTS school_students_registry_code_idx ON public.school_students(registry_code);
CREATE INDEX IF NOT EXISTS school_students_fee_status_idx ON public.school_students(fee_status);
CREATE INDEX IF NOT EXISTS school_students_created_at_idx ON public.school_students(created_at DESC);

-- Historical Student Archive (Soft-deletion recovery subsystem)
CREATE TABLE IF NOT EXISTS public.school_students_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id text NOT NULL,
  registry_code text,
  registration_number text,
  full_name text NOT NULL,
  parent_name text,
  email text,
  phone text,
  class_name text NOT NULL,
  stream text,
  fee_status text,
  fee_amount text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text NOT NULL DEFAULT 'Administrative Departure',
  archived_by text,
  original_data jsonb
);

CREATE INDEX IF NOT EXISTS school_students_archive_original_id_idx ON public.school_students_archive(original_id);
CREATE INDEX IF NOT EXISTS school_students_archive_class_idx ON public.school_students_archive(class_name);
CREATE INDEX IF NOT EXISTS school_students_archive_archived_at_idx ON public.school_students_archive(archived_at DESC);

-- 4. Staff & Class Stream Assignments ---------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_class_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, class_name)
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

-- 5. Stored Procedures / RPCs -----------------------------------------------

-- List verified teachers
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

-- List current stream assignments
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

-- Bulk CSV/Excel student roster ingestion engine
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
    COALESCE(TRIM(elem->>'stream'), 'General'),
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

-- 6. Row-Level Security (RLS) & Permissions ---------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_students_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_class_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users FROM anon, authenticated;
REVOKE ALL ON public.school_students FROM anon, authenticated;
REVOKE ALL ON public.school_students_archive FROM anon, authenticated;
REVOKE ALL ON public.teacher_class_assignments FROM anon, authenticated;
REVOKE ALL ON public.teacher_student_register FROM PUBLIC;

GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_students TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.school_students_archive TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.teacher_class_assignments TO authenticated;
GRANT SELECT ON public.teacher_student_register TO authenticated;

-- Users policies: read all staff profiles; IT role can modify roles
CREATE POLICY users_select_staff ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_update_it ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_school_role() = 'it')
  WITH CHECK (id = (SELECT auth.uid()) OR public.current_school_role() = 'it');

-- Students policies
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

CREATE POLICY students_write_dean_or_it ON public.school_students FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Students archive policies
CREATE POLICY archive_manage_dean_or_it ON public.school_students_archive FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- Teacher class assignments policies
CREATE POLICY assignments_read_authorized ON public.teacher_class_assignments FOR SELECT TO authenticated
  USING (
    teacher_user_id = (SELECT auth.uid())
    OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it')
  );

CREATE POLICY assignments_manage_dean_or_it ON public.teacher_class_assignments FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

GRANT EXECUTE ON FUNCTION public.list_school_teachers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_class_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_school_students(jsonb) TO authenticated;

COMMIT;
