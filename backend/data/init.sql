-- ClawHub PostgreSQL 数据库初始化脚本
-- 用于本地开发环境快速初始化

-- 创建数据库（如果不存在）
-- 注意：需要在 psql 之外运行：createdb clawhub_dev

-- 连接到数据库后运行以下命令

-- 1. 运行主 schema
\i schema.sql

-- 2. 插入测试数据（可选）
-- INSERT INTO skills (slug, display_name, description, tags) VALUES
--     ('test-skill', 'Test Skill', 'A test skill for development', ARRAY['test', 'demo']),
--     ('another-skill', 'Another Skill', 'Another test skill', ARRAY['demo']);

-- INSERT INTO skill_versions (skill_id, version, changelog, files, parsed, content_hash)
-- SELECT
--     s.id,
--     '1.0.0',
--     'Initial release',
--     '[{"path":"README.md","size":100,"storage_key":"skills/test/README.md","sha256":"abc123","content_type":"text/markdown"}]'::jsonb,
--     '{"name": "test-skill", "version": "1.0.0"}'::jsonb,
--     'def456'
-- FROM skills s
-- WHERE s.slug = 'test-skill';

-- 3. 验证表结构
-- \d skills
-- \d skill_versions
