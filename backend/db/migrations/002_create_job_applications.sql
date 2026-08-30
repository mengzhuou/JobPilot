CREATE TABLE IF NOT EXISTS jobpilot.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    job_url TEXT NOT NULL,
    job_title TEXT,
    company TEXT,
    location TEXT,
    source TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'applied',
    notes TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT job_applications_status_check CHECK (
        status IN ('applied', 'interviewing', 'accepted', 'rejected', 'no_response', 'withdrawn')
    ),
    CONSTRAINT job_applications_user_url_unique UNIQUE (user_id, job_url)
);

CREATE INDEX IF NOT EXISTS job_applications_user_applied_at_idx
    ON jobpilot.job_applications (user_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_user_status_idx
    ON jobpilot.job_applications (user_id, status);

DROP TRIGGER IF EXISTS job_applications_set_updated_at ON jobpilot.job_applications;

CREATE TRIGGER job_applications_set_updated_at
BEFORE UPDATE ON jobpilot.job_applications
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
