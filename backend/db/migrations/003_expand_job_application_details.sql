ALTER TABLE jobpilot.job_applications
    ADD COLUMN IF NOT EXISTS external_job_id TEXT,
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
    ADD COLUMN IF NOT EXISTS workplace_type TEXT,
    ADD COLUMN IF NOT EXISTS job_posted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_external_job_unique
    ON jobpilot.job_applications (user_id, source, external_job_id)
    WHERE external_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_applications_follow_up_idx
    ON jobpilot.job_applications (user_id, follow_up_at)
    WHERE follow_up_at IS NOT NULL AND archived = FALSE;
