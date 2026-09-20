ALTER TABLE jobpilot.user_resumes
    ADD COLUMN IF NOT EXISTS extracted_text TEXT,
    ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS extraction_error TEXT;

CREATE TABLE IF NOT EXISTS jobpilot.candidate_context_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL,
    source_key CHAR(64) NOT NULL,
    source_url TEXT,
    content TEXT NOT NULL DEFAULT '',
    content_hash CHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'ready',
    error_message TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_context_source_type_check CHECK (source_type IN ('portfolio')),
    CONSTRAINT candidate_context_source_status_check CHECK (status IN ('ready', 'unavailable')),
    CONSTRAINT candidate_context_source_unique UNIQUE (user_id, source_type, source_key)
);

CREATE INDEX IF NOT EXISTS candidate_context_sources_user_idx
    ON jobpilot.candidate_context_sources (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS candidate_context_sources_set_updated_at ON jobpilot.candidate_context_sources;
CREATE TRIGGER candidate_context_sources_set_updated_at
BEFORE UPDATE ON jobpilot.candidate_context_sources
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();

CREATE TABLE IF NOT EXISTS jobpilot.application_answer_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    context_hash CHAR(64) NOT NULL,
    user_context TEXT NOT NULL DEFAULT '',
    accepted_answer TEXT NOT NULL,
    job_title TEXT,
    company TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT application_answer_memory_unique UNIQUE (user_id, normalized_question, context_hash)
);

CREATE INDEX IF NOT EXISTS application_answer_memories_user_updated_idx
    ON jobpilot.application_answer_memories (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS application_answer_memories_set_updated_at ON jobpilot.application_answer_memories;
CREATE TRIGGER application_answer_memories_set_updated_at
BEFORE UPDATE ON jobpilot.application_answer_memories
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
