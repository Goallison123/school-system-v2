CREATE OR REPLACE FUNCTION public.list_school_teachers()
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administrators can view the teacher list'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.full_name, u.email
  FROM public.users AS u
  WHERE u.role::text = 'teacher'
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
  IF public.current_school_role() NOT IN ('dean_of_studies', 'it') THEN
    RAISE EXCEPTION 'Only academic administrators can view teacher assignments'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT assignment.teacher_user_id, teacher.full_name, assignment.class_name
  FROM public.teacher_class_assignments AS assignment
  JOIN public.users AS teacher ON teacher.id = assignment.teacher_user_id
  WHERE teacher.role::text = 'teacher'
  ORDER BY assignment.class_name, NULLIF(trim(teacher.full_name), ''), teacher.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_school_teachers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_teacher_class_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_school_teachers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_teacher_class_assignments() TO authenticated;
