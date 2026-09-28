const { pool } = require("../config/postgres");

const columns = {
    personal: "personal",
    education: "education",
    experience: "work_experience",
    skills: "skills",
    preferences: "job_preferences",
    equalEmployment: "equal_employment",
};

const toProfile = row => row && ({
    personal: row.personal,
    education: row.education,
    experience: row.work_experience,
    skills: row.skills,
    preferences: row.job_preferences,
    equalEmployment: row.equal_employment,
    updatedAt: row.updated_at,
});

const getByUserId = async userId => {
    const result = await pool.query("SELECT * FROM jobpilot.user_profiles WHERE user_id=$1::UUID", [userId]);
    return toProfile(result.rows[0]);
};

const upsert = async (userId, profile) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.user_profiles
            (user_id,personal,education,work_experience,skills,job_preferences,equal_employment)
         VALUES ($1,$2::JSONB,$3::JSONB,$4::JSONB,$5::JSONB,$6::JSONB,$7::JSONB)
         ON CONFLICT (user_id) DO UPDATE SET
            personal=EXCLUDED.personal,
            education=EXCLUDED.education,
            work_experience=EXCLUDED.work_experience,
            skills=EXCLUDED.skills,
            job_preferences=EXCLUDED.job_preferences,
            equal_employment=EXCLUDED.equal_employment
         RETURNING *`,
        [userId, ...["personal","education","experience","skills","preferences","equalEmployment"].map(key => JSON.stringify(profile[key]))]
    );
    return toProfile(result.rows[0]);
};

const updateSection = async (userId, section, value) => {
    const column = columns[section];
    if (!column) throw Object.assign(new Error("Unknown profile section"), { statusCode: 400 });
    const result = await pool.query(
        `INSERT INTO jobpilot.user_profiles (user_id, ${column}) VALUES ($2::UUID, $1::JSONB)
         ON CONFLICT (user_id) DO UPDATE SET ${column}=EXCLUDED.${column}
         RETURNING *`,
        [JSON.stringify(value), userId]
    );
    return toProfile(result.rows[0]);
};

const importResume = async (userId, parsed) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('INSERT INTO jobpilot.user_profiles (user_id) VALUES ($1::UUID) ON CONFLICT DO NOTHING',[userId]);
        const current = await client.query('SELECT * FROM jobpilot.user_profiles WHERE user_id=$1::UUID FOR UPDATE',[userId]);
        const profile = require('../services/resumeProfileService').mergeResumeProfile(toProfile(current.rows[0]),parsed);
        const result = await client.query(`UPDATE jobpilot.user_profiles SET personal=$2::JSONB, education=$3::JSONB, work_experience=$4::JSONB, skills=$5::JSONB WHERE user_id=$1::UUID RETURNING *`,[userId,...['personal','education','experience','skills'].map(key=>JSON.stringify(profile[key]))]);
        await client.query('COMMIT');
        return toProfile(result.rows[0]);
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
};
module.exports = { getByUserId, updateSection, upsert, importResume };
