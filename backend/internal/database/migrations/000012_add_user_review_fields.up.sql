ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '';

UPDATE users
SET status = 'email_pending'
WHERE status = 'pending';
