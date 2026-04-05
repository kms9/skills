ALTER TABLE skills ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS stats_stars INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_skills_owner_user_id ON skills(owner_user_id);
