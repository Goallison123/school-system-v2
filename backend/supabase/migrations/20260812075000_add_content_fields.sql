-- Add additional fields expected by the public site to school_content
ALTER TABLE IF EXISTS school_content
  ADD COLUMN IF NOT EXISTS author text DEFAULT 'Administrator',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS content text[],
  ADD COLUMN IF NOT EXISTS read_time text,
  ADD COLUMN IF NOT EXISTS image text;

-- Update index if needed
CREATE INDEX IF NOT EXISTS school_content_published_at_idx ON school_content(published_at DESC);
