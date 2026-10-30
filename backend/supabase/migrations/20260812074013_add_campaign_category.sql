/*
# Add category to notification campaigns

1. Modified Tables
- `notification_campaigns`: adds a `category` text column to classify notifications
  (Parent notification, Attendance alert, Fee reminder, Examination result, Emergency announcement).

2. Security
- No policy changes. Existing workspace CRUD policies already cover the new column.

3. Notes
- The column is nullable so existing rows remain valid.
- Backfill is not required; the frontend assigns a default category for new campaigns.
*/

ALTER TABLE notification_campaigns
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Parent notification';