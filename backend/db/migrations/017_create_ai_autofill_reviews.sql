CREATE TABLE IF NOT EXISTS jobpilot.ai_autofill_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    job_url TEXT NOT NULL,
    job_title TEXT,
    company TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'waiting_for_review',
    ambiguity_mode VARCHAR(30) NOT NULL DEFAULT 'auto_review',
    answers JSONB NOT NULL DEFAULT '[]'::JSONB,
    unresolved_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_autofill_reviews_status_check CHECK (status IN ('waiting_for_review', 'reviewed', 'dismissed')),
    CONSTRAINT ai_autofill_reviews_ambiguity_mode_check CHECK (ambiguity_mode IN ('auto_review', 'ask_user'))
);

CREATE INDEX IF NOT EXISTS ai_autofill_reviews_user_status_updated_idx
    ON jobpilot.ai_autofill_reviews (user_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS ai_autofill_reviews_set_updated_at ON jobpilot.ai_autofill_reviews;
CREATE TRIGGER ai_autofill_reviews_set_updated_at
BEFORE UPDATE ON jobpilot.ai_autofill_reviews
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
