ALTER TABLE users
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by;

UPDATE users
SET status = 'pending'
WHERE status = 'email_pending';
