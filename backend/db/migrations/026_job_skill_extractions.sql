CREATE TABLE IF NOT EXISTS jobpilot.job_skill_extractions (
    fingerprint TEXT PRIMARY KEY,
    result JSONB,
    retry_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
