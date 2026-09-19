CREATE TABLE IF NOT EXISTS jobpilot.job_detail_snapshots (
    job_id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    job_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT job_detail_snapshots_object CHECK (jsonb_typeof(job_data) = 'object')
);

CREATE INDEX IF NOT EXISTS job_detail_snapshots_source_url_idx
    ON jobpilot.job_detail_snapshots (source_url);

DROP TRIGGER IF EXISTS job_detail_snapshots_set_updated_at ON jobpilot.job_detail_snapshots;
CREATE TRIGGER job_detail_snapshots_set_updated_at
BEFORE UPDATE ON jobpilot.job_detail_snapshots
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
