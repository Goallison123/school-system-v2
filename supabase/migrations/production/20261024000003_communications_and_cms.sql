-- ============================================================================
-- Groupe Scolaire Gacuba 2A — Production Core Migration (03 of 03)
-- Architecture: Supabase PostgreSQL 15 | Row-Level Security
-- Scope: SMS Communications, Deduplication Ledgers, Outbox, CMS & Public Inquiries
-- Generated to match live Supabase project schema: dhiruneqrgdrlqmsmmhx
-- ============================================================================

BEGIN;

-- 1. School Contacts (Parent Directory) -------------------------------------
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

-- 2. Notification Campaigns -------------------------------------------------
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

-- 3. SMS Campaign Dispatches (Deduplication Ledger) -------------------------
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

-- 4. Midterm SMS Dispatches (Academic SMS Deduplication) ---------------------
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

-- 5. Midterm Notification Outbox (Transactional Async Queue) ----------------
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

-- 6. School Content (CMS Articles, Notices, Announcements) ------------------
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

-- 7. School Inquiries (Public Website Contact Submissions) ------------------
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

-- 8. Gallery Items (School Life Media Showcase) -----------------------------
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

-- 9. News Items (Official Publications & Announcements) ---------------------
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

-- 10. Row-Level Security (RLS) & Policies -----------------------------------

ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_sms_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midterm_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_contacts FROM anon, authenticated;
REVOKE ALL ON public.notification_campaigns FROM anon, authenticated;
REVOKE ALL ON public.sms_campaign_dispatches FROM anon, authenticated;
REVOKE ALL ON public.midterm_sms_dispatches FROM anon, authenticated;
REVOKE ALL ON public.midterm_notification_outbox FROM anon, authenticated;
REVOKE ALL ON public.school_content FROM anon, authenticated;
REVOKE ALL ON public.school_inquiries FROM anon, authenticated;
REVOKE ALL ON public.gallery_items FROM anon, authenticated;
REVOKE ALL ON public.news_items FROM anon, authenticated;

-- Public / Anonymous Grants (Website forms & showcase)
GRANT SELECT ON public.gallery_items TO anon, authenticated;
GRANT SELECT ON public.news_items TO anon, authenticated;
GRANT SELECT ON public.school_content TO anon, authenticated;
GRANT INSERT ON public.school_inquiries TO anon, authenticated;

-- Authenticated Staff Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_campaign_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_sms_dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midterm_notification_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_content TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.school_inquiries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gallery_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news_items TO authenticated;

-- Contacts Policies
CREATE POLICY contacts_select ON public.school_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY contacts_manage ON public.school_contacts FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Notification Campaigns Policies
CREATE POLICY campaigns_select ON public.notification_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY campaigns_manage ON public.notification_campaigns FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- SMS Campaign Dispatches Policies
CREATE POLICY sms_dispatches_select ON public.sms_campaign_dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY sms_dispatches_insert ON public.sms_campaign_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Midterm SMS Dispatches Policies
CREATE POLICY midterm_dispatches_select ON public.midterm_sms_dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY midterm_dispatches_insert ON public.midterm_sms_dispatches FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Outbox Policies
CREATE POLICY outbox_select ON public.midterm_notification_outbox FOR SELECT TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));
CREATE POLICY outbox_insert ON public.midterm_notification_outbox FOR INSERT TO authenticated WITH CHECK (true);

-- CMS School Content Policies
CREATE POLICY content_public_read ON public.school_content FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));
CREATE POLICY content_manage ON public.school_content FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- School Inquiries Policies
CREATE POLICY inquiries_public_insert ON public.school_inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY inquiries_staff_manage ON public.school_inquiries FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));

-- Gallery Items Policies
CREATE POLICY gallery_public_read ON public.gallery_items FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));
CREATE POLICY gallery_manage ON public.gallery_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

-- News Items Policies
CREATE POLICY news_public_read ON public.news_items FOR SELECT TO anon, authenticated
  USING (status = 'Published' OR public.current_school_role() IN ('dean_of_studies', 'headteacher', 'it'));
CREATE POLICY news_manage ON public.news_items FOR ALL TO authenticated
  USING (public.current_school_role() IN ('dean_of_studies', 'it'))
  WITH CHECK (public.current_school_role() IN ('dean_of_studies', 'it'));

COMMIT;
