CREATE TABLE IF NOT EXISTS jobpilot.extension_pairing_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS extension_pairing_codes_user_created_idx
    ON jobpilot.extension_pairing_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobpilot.extension_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    device_name TEXT NOT NULL DEFAULT 'Chrome extension',
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT extension_tokens_device_name_length
        CHECK (char_length(device_name) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS extension_tokens_user_active_idx
    ON jobpilot.extension_tokens (user_id, created_at DESC)
    WHERE revoked_at IS NULL;

