CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_skills_display_name_trgm ON skills USING gin(display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_description_trgm ON skills USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_versions_content_hash ON skill_versions(content_hash);
