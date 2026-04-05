CREATE TABLE IF NOT EXISTS skill_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_comments_skill_created_at
  ON skill_comments (skill_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_comments_user_id
  ON skill_comments (user_id);
