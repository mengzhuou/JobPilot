CREATE TABLE jobpilot.resume_enhancement_preferences (
    user_id UUID PRIMARY KEY REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    reminders_disabled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE jobpilot.resume_enhancements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    source_resume_id UUID REFERENCES jobpilot.user_resumes(id) ON DELETE SET NULL,
    saved_resume_id UUID REFERENCES jobpilot.user_resumes(id) ON DELETE SET NULL,
    fingerprint TEXT NOT NULL,
    job_key TEXT NOT NULL,
    job JSONB NOT NULL,
    source_name TEXT NOT NULL,
    source_text TEXT NOT NULL,
    analysis JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'assessed' CHECK (status IN ('assessed','generating','ready','failed','saved')),
    dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    changes JSONB NOT NULL DEFAULT '[]',
    options JSONB NOT NULL DEFAULT '{}',
    usage JSONB NOT NULL DEFAULT '{}',
    reviewed_text TEXT,
    error_message TEXT,
    generation_id UUID,
    generated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fingerprint)
);
CREATE INDEX resume_enhancements_history ON jobpilot.resume_enhancements(user_id, created_at DESC);
CREATE TABLE jobpilot.job_resume_selections (
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    job_key TEXT NOT NULL,
    resume_id UUID NOT NULL REFERENCES jobpilot.user_resumes(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, job_key)
);
