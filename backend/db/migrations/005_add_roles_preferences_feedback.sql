ALTER TABLE jobpilot.users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE jobpilot.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE jobpilot.users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

UPDATE jobpilot.users SET role = 'admin'
WHERE LOWER(email) = LOWER('a1106983163@gmail.com');

CREATE TABLE IF NOT EXISTS jobpilot.job_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    external_job_id TEXT,
    job_url TEXT NOT NULL,
    job_title TEXT,
    company TEXT,
    location TEXT,
    source TEXT,
    state VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT job_preferences_state_check CHECK (state IN ('saved', 'blocked')),
    CONSTRAINT job_preferences_user_url_unique UNIQUE (user_id, job_url)
);

CREATE INDEX IF NOT EXISTS job_preferences_user_state_idx
    ON jobpilot.job_preferences (user_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS jobpilot.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'unread',
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT feedback_status_check CHECK (status IN ('unread', 'read', 'resolved'))
);

CREATE INDEX IF NOT EXISTS feedback_status_created_idx
    ON jobpilot.feedback (status, created_at DESC);
