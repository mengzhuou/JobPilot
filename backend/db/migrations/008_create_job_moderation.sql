CREATE TABLE IF NOT EXISTS jobpilot.job_moderation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_url TEXT NOT NULL UNIQUE,
    external_job_id TEXT,
    job_title TEXT,
    company TEXT,
    provider TEXT,
    permanently_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    admin_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
    reviewed_by UUID REFERENCES jobpilot.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobpilot.job_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    job_url TEXT NOT NULL,
    external_job_id TEXT,
    job_title TEXT,
    company TEXT,
    provider TEXT,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT job_reports_status_check CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    CONSTRAINT job_reports_user_url_unique UNIQUE (user_id, job_url)
);

CREATE INDEX IF NOT EXISTS job_reports_status_created_idx
    ON jobpilot.job_reports (status, created_at DESC);
