-- Separate, idempotent migration for installations that already loaded the draft table.
CREATE TABLE IF NOT EXISTS jobpilot.resume_enhancement_attempts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    enhancement_id UUID NOT NULL REFERENCES jobpilot.resume_enhancements(id) ON DELETE CASCADE,
    usage JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS resume_enhancement_daily_attempts ON jobpilot.resume_enhancement_attempts(user_id, created_at);
