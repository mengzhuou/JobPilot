const { pool } = require("../config/postgres");

const setPreference = async (userId, job) => {
    if (job.state === "none") {
        await pool.query(
            "DELETE FROM jobpilot.job_preferences WHERE user_id=$1::UUID AND job_url=$2",
            [userId, job.jobUrl]
        );
        return null;
    }
    if (!["saved", "blocked"].includes(job.state)) {
        throw Object.assign(new Error("Preference must be saved, blocked, or none"), { statusCode: 400 });
    }
    const result = await pool.query(
        `INSERT INTO jobpilot.job_preferences
            (user_id, external_job_id, job_url, job_title, company, location, source, state,
             employment_type, workplace_type, job_posted_at, salary, provider, tags, summary, requirements)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::JSONB,$15,$16::JSONB)
         ON CONFLICT (user_id, job_url) DO UPDATE SET
            external_job_id = COALESCE(EXCLUDED.external_job_id, jobpilot.job_preferences.external_job_id),
            job_title = COALESCE(EXCLUDED.job_title, jobpilot.job_preferences.job_title),
            company = COALESCE(EXCLUDED.company, jobpilot.job_preferences.company),
            location = COALESCE(EXCLUDED.location, jobpilot.job_preferences.location),
            source = COALESCE(EXCLUDED.source, jobpilot.job_preferences.source),
            employment_type = COALESCE(EXCLUDED.employment_type, jobpilot.job_preferences.employment_type),
            workplace_type = COALESCE(EXCLUDED.workplace_type, jobpilot.job_preferences.workplace_type),
            job_posted_at = COALESCE(EXCLUDED.job_posted_at, jobpilot.job_preferences.job_posted_at),
            salary = COALESCE(EXCLUDED.salary, jobpilot.job_preferences.salary),
            provider = COALESCE(EXCLUDED.provider, jobpilot.job_preferences.provider),
            tags = CASE
                WHEN EXCLUDED.tags = '[]'::JSONB THEN jobpilot.job_preferences.tags
                ELSE EXCLUDED.tags
            END,
            summary = COALESCE(EXCLUDED.summary, jobpilot.job_preferences.summary),
            requirements = CASE
                WHEN EXCLUDED.requirements = '[]'::JSONB THEN jobpilot.job_preferences.requirements
                ELSE EXCLUDED.requirements
            END,
            state = EXCLUDED.state,
            updated_at = NOW()
         RETURNING *`,
        [userId, job.externalJobId || null, job.jobUrl, job.jobTitle || null,
            job.company || null, job.location || null, job.source || null, job.state,
            job.employmentType || null, job.workplaceType || null, job.jobPostedAt || null,
            job.salary || null, job.provider || null, JSON.stringify(job.tags || []),
            job.summary || null, JSON.stringify(job.requirements || [])]
    );
    return result.rows[0];
};

const listPreferences = async (userId, state) => {
    const values = [userId];
    let condition = "preferences.user_id = $1";
    if (["saved", "blocked"].includes(state)) {
        values.push(state);
        condition += " AND preferences.state = $2";
    }
    const result = await pool.query(
        `SELECT preferences.*,
                EXISTS (
                    SELECT 1
                    FROM jobpilot.job_applications applications
                    WHERE applications.user_id = preferences.user_id
                      AND (
                          applications.job_url = preferences.job_url
                          OR (
                              applications.external_job_id IS NOT NULL
                              AND preferences.external_job_id IS NOT NULL
                              AND applications.external_job_id = preferences.external_job_id
                          )
                      )
                ) AS current_user_applied
         FROM jobpilot.job_preferences preferences
         WHERE ${condition}
           AND NOT EXISTS (
               SELECT 1 FROM jobpilot.job_moderation moderation
               WHERE moderation.permanently_blocked=TRUE
                 AND (
                     moderation.job_url=preferences.job_url
                     OR (moderation.external_job_id IS NOT NULL AND moderation.external_job_id=preferences.external_job_id)
                 )
           )
         ORDER BY preferences.updated_at DESC`,
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
