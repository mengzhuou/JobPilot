const { pool } = require("../config/postgres");

const create = async (userId, review) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.ai_autofill_reviews
            (user_id,job_url,job_title,company,ambiguity_mode,answers,unresolved_fields)
         VALUES ($1,$2,$3,$4,$5,$6::JSONB,$7::JSONB)
         RETURNING *`,
        [
            userId,
            review.jobUrl,
            review.jobTitle || null,
            review.company || null,
            review.ambiguityMode || "auto_review",
            JSON.stringify(review.answers || []),
            JSON.stringify(review.unresolvedFields || []),
        ]
    );
    return result.rows[0];
};

const update = async (userId, reviewId, review) => {
    const result = await pool.query(
        `UPDATE jobpilot.ai_autofill_reviews
         SET answers=$1::JSONB, unresolved_fields=$2::JSONB
         WHERE id=$3::UUID AND user_id=$4::UUID
         RETURNING *`,
        [JSON.stringify(review.answers || []), JSON.stringify(review.unresolvedFields || []), reviewId, userId]
    );
    return result.rows[0] || null;
};

const listWaitingForReview = async userId => {
    const result = await pool.query(
        `SELECT * FROM jobpilot.ai_autofill_reviews
         WHERE user_id=$1::UUID AND status='waiting_for_review'
         ORDER BY updated_at DESC`,
        [userId]
    );
    return result.rows;
};

const findById = async (userId, reviewId) => {
    const result = await pool.query(
        `SELECT * FROM jobpilot.ai_autofill_reviews WHERE id=$1::UUID AND user_id=$2::UUID`,
        [reviewId, userId]
    );
    return result.rows[0] || null;
};

module.exports = { create, update, listWaitingForReview, findById };
