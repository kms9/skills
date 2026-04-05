DROP INDEX IF EXISTS users_email_unique;

ALTER TABLE users DROP COLUMN IF EXISTS auth_provider;
ALTER TABLE users DROP COLUMN IF EXISTS activation_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS activation_code;
ALTER TABLE users DROP COLUMN IF EXISTS status;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

DROP INDEX IF EXISTS users_github_id_key;
CREATE UNIQUE INDEX users_github_id_key ON users(github_id);
ALTER TABLE users ALTER COLUMN github_id SET NOT NULL;
