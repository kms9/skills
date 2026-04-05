ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS has_bound_email BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS provider_open_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_union_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_tenant_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_unique ON users(pending_email) WHERE pending_email != '';

UPDATE users
SET
  pending_email = CASE
    WHEN status = 'email_pending' AND pending_email = '' AND email != '' THEN email
    ELSE pending_email
  END,
  has_bound_email = CASE
    WHEN auth_provider = 'email' AND email != '' AND status != 'email_pending' THEN TRUE
    ELSE has_bound_email
  END,
  email_verified_at = CASE
    WHEN auth_provider = 'email' AND email != '' AND status != 'email_pending' AND email_verified_at IS NULL THEN NOW()
    ELSE email_verified_at
  END;
