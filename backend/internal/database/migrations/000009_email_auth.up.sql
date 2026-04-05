-- Allow email-only registration (github_id becomes optional)
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;
DROP INDEX IF EXISTS users_github_id_key;
CREATE UNIQUE INDEX users_github_id_key ON users(github_id) WHERE github_id IS NOT NULL;

-- Password & activation fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'github';

-- Unique email index (skip empty strings from legacy rows)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email != '';
