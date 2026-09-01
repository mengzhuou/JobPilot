const { pool } = require("../config/postgres");

const getMarketSnapshot = async () => {
    const result = await pool.query("SELECT * FROM jobpilot.job_market_analytics WHERE id=1");
    return result.rows[0] || null;
};

const saveMarketSnapshot = async ({ totalJobs, categories, platformCategories, levelCategories, sourceFetchedAt, generatedBy }) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.job_market_analytics
            (id,total_jobs,categories,platform_categories,level_categories,source_fetched_at,generated_at,generated_by)
         VALUES (1,$1,$2::JSONB,$3::JSONB,$4::JSONB,$5,NOW(),$6)
         ON CONFLICT (id) DO UPDATE SET
            total_jobs=EXCLUDED.total_jobs,categories=EXCLUDED.categories,
            platform_categories=EXCLUDED.platform_categories,level_categories=EXCLUDED.level_categories,
            source_fetched_at=EXCLUDED.source_fetched_at,generated_at=NOW(),generated_by=EXCLUDED.generated_by
         RETURNING *`,
        [totalJobs, JSON.stringify(categories), JSON.stringify(platformCategories),
            JSON.stringify(levelCategories), sourceFetchedAt, generatedBy]
    );
    return result.rows[0];
};

module.exports = { getMarketSnapshot, saveMarketSnapshot };
