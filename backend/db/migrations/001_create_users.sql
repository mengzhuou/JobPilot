CREATE SCHEMA IF NOT EXISTS jobpilot;

CREATE TABLE IF NOT EXISTS jobpilot.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider VARCHAR(30) NOT NULL DEFAULT 'google',
    provider_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    picture_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT users_auth_identity_unique
        UNIQUE (auth_provider, provider_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON jobpilot.users (LOWER(email));

CREATE OR REPLACE FUNCTION jobpilot.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON jobpilot.users;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON jobpilot.users
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
