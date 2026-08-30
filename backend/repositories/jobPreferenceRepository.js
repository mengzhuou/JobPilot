const { pool } = require("../config/postgres");

const setPreference = async (userId, job) => {
    if (!["saved", "blocked"].includes(job.state)) {
        throw Object.assign(new Error("Preference must be saved or blocked"), { statusCode: 400 });
    }
    const result = await pool.query(
        `INSERT INTO jobpilot.job_preferences
            (user_id, external_job_id, job_url, job_title, company, location, source, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, job_url) DO UPDATE SET
            external_job_id = COALESCE(EXCLUDED.external_job_id, jobpilot.job_preferences.external_job_id),
            job_title = COALESCE(EXCLUDED.job_title, jobpilot.job_preferences.job_title),
            company = COALESCE(EXCLUDED.company, jobpilot.job_preferences.company),
            location = COALESCE(EXCLUDED.location, jobpilot.job_preferences.location),
            source = COALESCE(EXCLUDED.source, jobpilot.job_preferences.source),
            state = EXCLUDED.state,
            updated_at = NOW()
         RETURNING *`,
        [userId, job.externalJobId || null, job.jobUrl, job.jobTitle || null,
            job.company || null, job.location || null, job.source || null, job.state]
    );
    return result.rows[0];
};

const listPreferences = async (userId, state) => {
    const values = [userId];
    let condition = "user_id = $1";
    if (["saved", "blocked"].includes(state)) {
        values.push(state);
        condition += " AND state = $2";
    }
    const result = await pool.query(
        `SELECT * FROM jobpilot.job_preferences WHERE ${condition} ORDER BY updated_at DESC`,
        values
    );
    return result.rows;
};

const removePreference = async (userId, id) => {
    const result = await pool.query(
        "DELETE FROM jobpilot.job_preferences WHERE id=$1::UUID AND user_id=$2::UUID RETURNING id",
        [id, userId]
    );
    return Boolean(result.rows[0]);
};

const getPreferenceSignals = async (userId, jobs) => {
    if (!jobs.length) return new Map();
    const urls = jobs.map(job => job.url).filter(Boolean);
    const ids = jobs.map(job => String(job.id || "")).filter(Boolean);
    const result = await pool.query(
        `SELECT job_url, external_job_id, state FROM jobpilot.job_preferences
         WHERE user_id=$1::UUID AND (job_url=ANY($2::TEXT[]) OR external_job_id=ANY($3::TEXT[]))`,
        [userId, urls, ids]
    );
    const signals = new Map();
    result.rows.forEach(row => {
        if (row.job_url) signals.set(`url:${row.job_url}`, row.state);
        if (row.external_job_id) signals.set(`id:${row.external_job_id}`, row.state);
    });
    return signals;
};

module.exports = { getPreferenceSignals, listPreferences, removePreference, setPreference };
