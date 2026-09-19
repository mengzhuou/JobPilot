CREATE TABLE IF NOT EXISTS jobpilot.user_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    target_job_title TEXT,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    file_data BYTEA NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_resumes_display_name_length CHECK (char_length(display_name) <= 199),
    CONSTRAINT user_resumes_target_job_title_length CHECK (target_job_title IS NULL OR char_length(target_job_title) <= 199)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_resumes_one_primary_idx
    ON jobpilot.user_resumes (user_id)
    WHERE is_primary;

CREATE INDEX IF NOT EXISTS user_resumes_user_updated_idx
    ON jobpilot.user_resumes (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS user_resumes_set_updated_at ON jobpilot.user_resumes;
CREATE TRIGGER user_resumes_set_updated_at
BEFORE UPDATE ON jobpilot.user_resumes
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
