-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Core Migration (03 of 03)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: SMS Communications, Deduplication Ledgers, Public CMS & Inquiries
-- ============================================================================

BEGIN;

-- 1. Notification Campaigns & SMS Deduplication Ledgers ---------------------

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  category text DEFAULT 'Parent notification',
  channels text[] NOT NULL DEFAULT ARRAY['SMS'],
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  status text NOT NULL DEFAULT 'Draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_campaigns_created_at_idx 
  ON public.notification_campaigns(created_at DESC);

-- Fingerprint ledger ensuring zero duplicate dispatches to parents
CREATE TABLE IF NOT EXISTS public.sms_campaign_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  campaign_id uuid REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  recipient_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_campaign_dispatches_fingerprint_idx 
  ON public.sms_campaign_dispatches(fingerprint);

-- Academic Mid-Term SMS Dispatches
CREATE TABLE IF NOT EXISTS public.midterm_sms_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  period_id uuid NOT NULL REFERENCES public.midterm_periods(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS midterm_sms_dispatches_fingerprint_idx 
  ON public.midterm_sms_dispatches(fingerprint);

-- Transactional Outbox for Async Email / Notifications
CREATE TABLE IF NOT EXISTS public.midterm_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_email text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS midterm_notification_outbox_delivered_idx 
  ON public.midterm_notification_outbox(delivered_at) WHERE delivered_at IS NULL;

-- 2. Public CMS Content Management (News & Gallery) -------------------------

CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'Gallery',
  excerpt text,
  image_url text,
  src text,
  date text,
  category text,
  description text,
  summary text,
  content text[],
  author text DEFAULT 'Administrator',
  read_time text,
  image text,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_items_status_idx ON public.gallery_items(status);
CREATE INDEX IF NOT EXISTS gallery_items_published_at_idx ON public.gallery_items(published_at DESC);

CREATE TABLE IF NOT EXISTS public.news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'News',
  excerpt text,
  image_url text,
  src text,
  date text,
  category text,
  description text,
  summary text,
  content text[],
  author text DEFAULT 'Administrator',
  read_time text,
  image text,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_status_idx ON public.news_items(status);
CREATE INDEX IF NOT EXISTS news_items_published_at_idx ON public.news_items(published_at DESC);

-- 3. Admissions Inquiries Desk & Workspace Settings ------------------------

CREATE TABLE IF NOT EXISTS public.school_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL,
  email text,
  phone text,
  topic text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'New',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_inquiries_created_at_idx 
  ON public.school_inquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  admin_name text NOT NULL DEFAULT 'Administrator',
  default_notification_channel text NOT NULL DEFAULT 'SMS',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workspace_settings (id, admin_name, default_notification_channel)
VALUES ('00000000-0000-0000-0000-000000000001', 'G.S Gacuba 2A Administration', 'SMS')
ON CONFLICT (id) DO NOTHING;

-- 4. Row-Level Security (RLS) & Permissions ---------------------------------

ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_sms_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_campaigns FROM anon, authenticated;
REVOKE ALL ON public.sms_campaign_dispatches FROM anon, authenticated;
REVOKE ALL ON public.midterm_sms_dispatches FROM anon, authenticated;
REVOKE ALL ON public.midterm_notification_outbox FROM anon, authenticated;
REVOKE ALL ON public.gallery_items FROM anon, authenticated;
REVOKE ALL ON public.news_items FROM anon, authenticated;
REVOKE ALL ON public.school_inquiries FROM anon, authenticated;
REVOKE ALL ON public.workspace_settings FROM anon, authenticated;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_campaign_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.midterm_sms_dispatches TO authenticated;
GRANT SELECT, UPDATE ON public.midterm_notification_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_inquiries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_settings TO authenticated;

-- Anonymous public read for published landing page content & inquiries submission
GRANT SELECT ON public.gallery_items TO anon;
GRANT SELECT ON public.news_items TO anon;
GRANT INSERT ON public.school_inquiries TO anon;

-- Campaigns policies
CREATE POLICY campaigns_select_leadership ON public.notification_campaigns FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

CREATE POLICY campaigns_write_leadership ON public.notification_campaigns FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Dispatches policies
CREATE POLICY sms_dispatches_manage_leadership ON public.sms_campaign_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

CREATE POLICY midterm_dispatches_manage_leadership ON public.midterm_sms_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Outbox policies
CREATE POLICY outbox_read_staff ON public.midterm_notification_outbox FOR SELECT TO authenticated
  USING (recipient_user_id = (SELECT auth.uid()) OR public.current_school_role() IN ('dean_of_studies', 'it'));

CREATE POLICY outbox_update_recipient ON public.midterm_notification_outbox FOR UPDATE TO authenticated
  USING (recipient_user_id = (SELECT auth.uid()))
  WITH CHECK (recipient_user_id = (SELECT auth.uid()));

-- CMS: Public read for published items, staff management for all items
CREATE POLICY gallery_anon_read_published ON public.gallery_items FOR SELECT TO anon
  USING (status = 'Published');

CREATE POLICY gallery_staff_all ON public.gallery_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

CREATE POLICY news_anon_read_published ON public.news_items FOR SELECT TO anon
  USING (status = 'Published');

CREATE POLICY news_staff_all ON public.news_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Inquiries: public can submit, staff can review
CREATE POLICY inquiries_anon_insert ON public.school_inquiries FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY inquiries_staff_all ON public.school_inquiries FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Settings policies
CREATE POLICY settings_select_authenticated ON public.workspace_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY settings_write_leadership ON public.workspace_settings FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

COMMIT;
