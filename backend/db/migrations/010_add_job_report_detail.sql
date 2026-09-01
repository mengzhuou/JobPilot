ALTER TABLE jobpilot.job_reports
    ADD COLUMN IF NOT EXISTS reason_detail VARCHAR(199);
