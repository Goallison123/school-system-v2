ALTER TABLE email_dispatches
  ADD COLUMN IF NOT EXISTS dispatch_key text;

CREATE INDEX IF NOT EXISTS email_dispatches_dispatch_key_idx
  ON email_dispatches(dispatch_key);

CREATE OR REPLACE FUNCTION link_email_dispatches_to_campaign(
  p_dispatch_key text,
  p_campaign_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_count integer;
BEGIN
  IF p_dispatch_key IS NULL OR length(trim(p_dispatch_key)) = 0 OR p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Dispatch key and campaign ID are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('dean_of_studies', 'headteacher', 'it')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.email_dispatches
  SET campaign_id = p_campaign_id
  WHERE dispatch_key = trim(p_dispatch_key)
    AND created_by = auth.uid()
    AND campaign_id IS NULL;

  GET DIAGNOSTICS linked_count = ROW_COUNT;
  RETURN linked_count;
END;
$$;

REVOKE ALL ON FUNCTION link_email_dispatches_to_campaign(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_email_dispatches_to_campaign(text, uuid) TO authenticated;
