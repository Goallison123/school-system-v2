
-- Secure mid-term finalization and parent notification queue.
-- Existing reports, marks, and triggers are preserved.

CREATE TABLE IF NOT EXISTS public.midterm_parent_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL
    REFERENCES public.midterm_reports(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT midterm_parent_notification_once
    UNIQUE (report_id, channel)
);

CREATE INDEX IF NOT EXISTS
  midterm_parent_notification_pending_idx
ON public.midterm_parent_notification_queue (created_at)
WHERE status IN ('pending', 'failed');

ALTER TABLE public.midterm_parent_notification_queue
  ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.midterm_parent_notification_queue TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_midterm_secure(
  p_period_id uuid,
  p_actor_id uuid,
  p_tokens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_period public.midterm_periods%ROWTYPE;
  v_role text;
  v_missing_student text;
  v_report_count integer;
  v_token_count integer;
  v_email_queued integer := 0;
  v_sms_queued integer := 0;
BEGIN
  -- Only the server-side service role should call this RPC.
  SELECT role::text
    INTO v_role
  FROM public.users
  WHERE id = p_actor_id;

  IF v_role IS DISTINCT FROM 'dean_of_studies' THEN
    RAISE EXCEPTION 'Only the dean of studies can finalize a mid-term.';
  END IF;

  IF jsonb_typeof(p_tokens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Report tokens must be provided as an array.';
  END IF;

  -- Serialize finalization attempts for this period.
  SELECT *
    INTO v_period
  FROM public.midterm_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND OR v_period.status <> 'open' THEN
    RAISE EXCEPTION 'The selected mid-term does not exist or is not open.';
  END IF;

  -- Every registered student whose class has enabled mid-term
  -- subjects must have a non-deleted report for this period.
  SELECT s.full_name
    INTO v_missing_student
  FROM public.school_students s
  WHERE EXISTS (
    SELECT 1
    FROM public.midterm_subjects ms
    WHERE ms.class_name = s.class_name
      AND ms.is_enabled
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.midterm_reports r
    WHERE r.student_id = s.id
      AND r.period_id = p_period_id
      AND NOT r.is_deleted
  )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Cannot finalize: a student is missing a report. First missing student: %',
      v_missing_student;
  END IF;

  SELECT count(*)
    INTO v_report_count
  FROM public.midterm_reports
  WHERE period_id = p_period_id
    AND NOT is_deleted;

  IF v_report_count = 0 THEN
    RAISE EXCEPTION 'There are no reports to publish.';
  END IF;

  SELECT count(DISTINCT t.report_id)
    INTO v_token_count
  FROM jsonb_to_recordset(p_tokens) AS t(
    report_id uuid,
    token_hash text,
    expires_at timestamptz,
    url text
  )
  WHERE t.token_hash IS NOT NULL
    AND t.token_hash <> ''
    AND t.expires_at > now()
    AND t.url IS NOT NULL
    AND t.url <> '';

  IF v_token_count <> v_report_count
     OR jsonb_array_length(p_tokens) <> v_report_count THEN
    RAISE EXCEPTION
      'Every report must have exactly one valid secure link.';
  END IF;

  -- Reject token entries for reports outside this period.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_tokens) AS t(
      report_id uuid,
      token_hash text,
      expires_at timestamptz,
      url text
    )
    LEFT JOIN public.midterm_reports r
      ON r.id = t.report_id
     AND r.period_id = p_period_id
     AND NOT r.is_deleted
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A supplied link refers to an invalid report.';
  END IF;

  -- Store only the token hash on the report.
  UPDATE public.midterm_reports r
  SET access_token_hash = t.token_hash,
      access_token_expires_at = t.expires_at,
      published_at = now()
  FROM jsonb_to_recordset(p_tokens) AS t(
    report_id uuid,
    token_hash text,
    expires_at timestamptz,
    url text
  )
  WHERE r.id = t.report_id
    AND r.period_id = p_period_id
    AND NOT r.is_deleted;

  -- Queue email notifications. The raw link is kept only in
  -- this service-only queue so a delivery worker can send it.
  WITH token_data AS (
    SELECT *
    FROM jsonb_to_recordset(p_tokens) AS t(
      report_id uuid,
      token_hash text,
      expires_at timestamptz,
      url text
    )
  ),
  contacts AS (
    SELECT DISTINCT ON (report_id)
      report_id, parent_name, phone, email
    FROM public.midterm_report_contacts
    ORDER BY report_id, captured_at DESC
  )
  INSERT INTO public.midterm_parent_notification_queue
    (report_id, channel, recipient, payload)
  SELECT
    r.id,
    'email',
    trim(c.email),
    jsonb_build_object(
      'report_url', t.url,
      'parent_name', c.parent_name,
      'student_name', r.student_name,
      'period_name', v_period.name
    )
  FROM public.midterm_reports r
  JOIN token_data t ON t.report_id = r.id
  JOIN contacts c ON c.report_id = r.id
  WHERE r.period_id = p_period_id
    AND NOT r.is_deleted
    AND trim(coalesce(c.email, '')) <> ''
  ON CONFLICT (report_id, channel) DO NOTHING;

  GET DIAGNOSTICS v_email_queued = ROW_COUNT;

  -- Queue SMS notifications separately.
  WITH token_data AS (
    SELECT *
    FROM jsonb_to_recordset(p_tokens) AS t(
      report_id uuid,
      token_hash text,
      expires_at timestamptz,
      url text
    )
  ),
  contacts AS (
    SELECT DISTINCT ON (report_id)
      report_id, parent_name, phone, email
    FROM public.midterm_report_contacts
    ORDER BY report_id, captured_at DESC
  )
  INSERT INTO public.midterm_parent_notification_queue
    (report_id, channel, recipient, payload)
  SELECT
    r.id,
    'sms',
    trim(c.phone),
    jsonb_build_object(
      'report_url', t.url,
      'student_name', r.student_name,
      'period_name', v_period.name
    )
  FROM public.midterm_reports r
  JOIN token_data t ON t.report_id = r.id
  JOIN contacts c ON c.report_id = r.id
  WHERE r.period_id = p_period_id
    AND NOT r.is_deleted
    AND trim(coalesce(c.phone, '')) <> ''
  ON CONFLICT (report_id, channel) DO NOTHING;

  GET DIAGNOSTICS v_sms_queued = ROW_COUNT;

  -- The lock is committed together with the token hashes and queue.
  UPDATE public.midterm_periods
  SET status = 'finalized',
      finalized_at = now(),
      finalized_by = p_actor_id
  WHERE id = p_period_id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The mid-term could not be finalized.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'reports_published', v_report_count,
    'emails_queued', v_email_queued,
    'sms_queued', v_sms_queued
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_midterm_secure(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_midterm_secure(uuid, uuid, jsonb)
  TO service_role;
