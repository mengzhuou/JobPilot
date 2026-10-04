CREATE TABLE IF NOT EXISTS jobpilot.confirmed_autofill_answers (
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    normalized_question TEXT NOT NULL,
    scope TEXT NOT NULL,
    question TEXT NOT NULL,
    answer_values JSONB NOT NULL CHECK (jsonb_typeof(answer_values) = 'array'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, normalized_question, scope)
);
