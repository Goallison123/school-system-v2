CREATE TABLE IF NOT EXISTS email_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('Delivered', 'Failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_dispatches_select_staff" ON email_dispatches;
CREATE POLICY "email_dispatches_select_staff"
  ON email_dispatches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('dean_of_studies', 'headteacher', 'it')
    )
  );

CREATE INDEX IF NOT EXISTS email_dispatches_created_at_idx ON email_dispatches(created_at DESC);
CREATE INDEX IF NOT EXISTS email_dispatches_campaign_id_idx ON email_dispatches(campaign_id);
