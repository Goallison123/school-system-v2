-- Create a workspace settings table for admin-configurable values
CREATE TABLE IF NOT EXISTS workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_name text NOT NULL DEFAULT 'Administrator',
  default_notification_channel text NOT NULL DEFAULT 'SMS',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_trigger ON workspace_settings;
CREATE TRIGGER set_updated_at_trigger
BEFORE UPDATE ON workspace_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY IF NOT EXISTS "workspace_select_workspace_settings" ON workspace_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY IF NOT EXISTS "workspace_insert_workspace_settings" ON workspace_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "workspace_update_workspace_settings" ON workspace_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
