DROP INDEX IF EXISTS idx_auth_identities_provider_username;
DROP INDEX IF EXISTS idx_auth_identities_user_id;
DROP TABLE IF EXISTS auth_identities;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
