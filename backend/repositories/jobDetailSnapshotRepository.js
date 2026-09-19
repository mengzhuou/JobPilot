const { pool } = require("../config/postgres");

const getById = async jobId => {
    const result = await pool.query(
        "SELECT job_data FROM jobpilot.job_detail_snapshots WHERE job_id=$1",
        [jobId]
    );
    return result.rows[0]?.job_data || null;
};

const upsert = async job => {
    await pool.query(
        `INSERT INTO jobpilot.job_detail_snapshots (job_id, source_url, job_data)
         VALUES ($1, $2, $3::JSONB)
         ON CONFLICT (job_id) DO UPDATE SET
            source_url=EXCLUDED.source_url,
            job_data=EXCLUDED.job_data`,
        [String(job.id), job.url, JSON.stringify(job)]
    );
};

module.exports = { getById, upsert };
