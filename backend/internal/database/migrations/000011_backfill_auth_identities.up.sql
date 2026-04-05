INSERT INTO auth_identities (
    user_id,
    provider,
    provider_subject,
    provider_username,
    provider_email,
    provider_avatar_url,
    raw_claims,
    last_login_at,
    created_at,
    updated_at
)
SELECT
    id,
    'github',
    github_id::TEXT,
    handle,
    email,
    avatar_url,
    NULL,
    COALESCE(last_login_at, updated_at, created_at, NOW()),
    created_at,
    updated_at
FROM users
WHERE github_id IS NOT NULL
ON CONFLICT (provider, provider_subject) DO NOTHING;
