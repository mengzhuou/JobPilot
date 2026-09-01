ALTER TABLE jobpilot.job_moderation
    ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS resolution_note TEXT;

ALTER TABLE jobpilot.job_moderation DROP CONSTRAINT IF EXISTS job_moderation_status_check;
ALTER TABLE jobpilot.job_moderation ADD CONSTRAINT job_moderation_status_check
    CHECK (moderation_status IN ('pending', 'resolved_no_action', 'permanently_blocked'));

UPDATE jobpilot.job_moderation
SET moderation_status = CASE WHEN permanently_blocked THEN 'permanently_blocked' ELSE moderation_status END;
