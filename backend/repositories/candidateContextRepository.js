const { pool } = require("../config/postgres");

const findByKey = async (userId, sourceType, sourceKey) => {
    const result = await pool.query(
        `SELECT * FROM jobpilot.candidate_context_sources
         WHERE user_id=$1::UUID AND source_type=$2 AND source_key=$3`,
        [userId, sourceType, sourceKey]
    );
    return result.rows[0] || null;
};

const upsert = async (userId, source) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.candidate_context_sources
            (user_id,source_type,source_key,source_url,content,content_hash,status,error_message)
         VALUES ($1::UUID,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id,source_type,source_key) DO UPDATE SET
            source_url=EXCLUDED.source_url,
            content=EXCLUDED.content,
            content_hash=EXCLUDED.content_hash,
            status=EXCLUDED.status,
            error_message=EXCLUDED.error_message,
            fetched_at=NOW()
         RETURNING *`,
        [
            userId, source.sourceType, source.sourceKey, source.sourceUrl || null,
            source.content || "", source.contentHash || null, source.status || "ready",
            source.errorMessage || null,
        ]
    );
    return result.rows[0];
};

module.exports = { findByKey, upsert };
