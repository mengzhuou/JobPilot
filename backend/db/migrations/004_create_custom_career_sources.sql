CREATE TABLE IF NOT EXISTS jobpilot.custom_career_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submitted_by UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    career_url TEXT NOT NULL UNIQUE,
    provider VARCHAR(30) NOT NULL,
    board TEXT,
    original_input TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT custom_career_sources_status_check CHECK (status IN ('active', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS custom_career_sources_status_idx
    ON jobpilot.custom_career_sources (status);
