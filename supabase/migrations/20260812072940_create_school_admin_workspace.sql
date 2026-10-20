/*
# Create school admin workspace data

1. New Tables
- `school_contacts`: parent and guardian contact records imported by administrators.
- `notification_campaigns`: outbound SMS, WhatsApp, and email notification drafts and sent records.
- `school_content`: news, announcements, and gallery entries prepared for the connected website.
- `school_inquiries`: visitor messages and contact requests collected from the future landing page.

2. Important Columns
- Contact records include parent name, student name, class, phone, email, and preferred channel.
- Campaigns include the message, selected channels, recipient count, status, and scheduled time.
- Content includes title, type, excerpt, image URL, publication status, and publication date.
- Inquiries include visitor name, email, phone, topic, message, and workflow status.

3. Security
- Row-level security is enabled on every table.
- This first version is a single-school workspace without sign-in, so anon and authenticated roles have CRUD access to the intentionally shared school workspace data.

4. Notes
- No existing tables are modified.
- All identifiers are UUIDs and timestamps default to the current time.
*/

CREATE TABLE IF NOT EXISTS school_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_name text NOT NULL,
  student_name text,
  class_name text,
  phone text,
  email text,
  preferred_channel text NOT NULL DEFAULT 'SMS',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY['SMS'],
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'News',
  excerpt text,
  image_url text,
  status text NOT NULL DEFAULT 'Draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL,
  email text,
  phone text,
  topic text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'New',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE school_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_select_school_contacts" ON school_contacts;
CREATE POLICY "workspace_select_school_contacts" ON school_contacts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "workspace_insert_school_contacts" ON school_contacts;
CREATE POLICY "workspace_insert_school_contacts" ON school_contacts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_update_school_contacts" ON school_contacts;
CREATE POLICY "workspace_update_school_contacts" ON school_contacts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_delete_school_contacts" ON school_contacts;
CREATE POLICY "workspace_delete_school_contacts" ON school_contacts FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "workspace_select_notification_campaigns" ON notification_campaigns;
CREATE POLICY "workspace_select_notification_campaigns" ON notification_campaigns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "workspace_insert_notification_campaigns" ON notification_campaigns;
CREATE POLICY "workspace_insert_notification_campaigns" ON notification_campaigns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_update_notification_campaigns" ON notification_campaigns;
CREATE POLICY "workspace_update_notification_campaigns" ON notification_campaigns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_delete_notification_campaigns" ON notification_campaigns;
CREATE POLICY "workspace_delete_notification_campaigns" ON notification_campaigns FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "workspace_select_school_content" ON school_content;
CREATE POLICY "workspace_select_school_content" ON school_content FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "workspace_insert_school_content" ON school_content;
CREATE POLICY "workspace_insert_school_content" ON school_content FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_update_school_content" ON school_content;
CREATE POLICY "workspace_update_school_content" ON school_content FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_delete_school_content" ON school_content;
CREATE POLICY "workspace_delete_school_content" ON school_content FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "workspace_select_school_inquiries" ON school_inquiries;
CREATE POLICY "workspace_select_school_inquiries" ON school_inquiries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "workspace_insert_school_inquiries" ON school_inquiries;
CREATE POLICY "workspace_insert_school_inquiries" ON school_inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_update_school_inquiries" ON school_inquiries;
CREATE POLICY "workspace_update_school_inquiries" ON school_inquiries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "workspace_delete_school_inquiries" ON school_inquiries;
CREATE POLICY "workspace_delete_school_inquiries" ON school_inquiries FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS school_contacts_parent_name_idx ON school_contacts(parent_name);
CREATE INDEX IF NOT EXISTS notification_campaigns_created_at_idx ON notification_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS school_content_created_at_idx ON school_content(created_at DESC);
CREATE INDEX IF NOT EXISTS school_inquiries_created_at_idx ON school_inquiries(created_at DESC);