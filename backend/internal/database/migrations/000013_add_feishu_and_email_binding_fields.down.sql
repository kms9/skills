DROP INDEX IF EXISTS users_pending_email_unique;

ALTER TABLE auth_identities
  DROP COLUMN IF EXISTS provider_tenant_key,
  DROP COLUMN IF EXISTS provider_union_id,
  DROP COLUMN IF EXISTS provider_open_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS has_bound_email,
  DROP COLUMN IF EXISTS pending_email;
