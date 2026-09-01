CREATE TABLE IF NOT EXISTS jobpilot.job_market_analytics (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    total_jobs INTEGER NOT NULL DEFAULT 0,
    categories JSONB NOT NULL DEFAULT '[]'::JSONB,
    source_fetched_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID REFERENCES jobpilot.users(id) ON DELETE SET NULL
);
