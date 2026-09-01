ALTER TABLE jobpilot.job_market_analytics
    ADD COLUMN IF NOT EXISTS platform_categories JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS level_categories JSONB NOT NULL DEFAULT '[]'::JSONB;
