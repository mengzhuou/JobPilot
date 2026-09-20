const { pool } = require("../config/postgres");

const summaryColumns = `
    id, file_name, display_name, target_job_title, mime_type, file_size,
    is_primary, created_at, updated_at
`;

const listByUserId = async userId => {
    const result = await pool.query(
        `SELECT ${summaryColumns}
         FROM jobpilot.user_resumes
         WHERE user_id = $1::UUID
         ORDER BY is_primary DESC, updated_at DESC`,
        [userId]
    );
    return result.rows;
};

const create = async (userId, resume) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const count = await client.query(
            "SELECT COUNT(*)::INTEGER AS count FROM jobpilot.user_resumes WHERE user_id=$1::UUID",
            [userId]
        );
        if (count.rows[0].count >= 5) throw Object.assign(new Error("You can save up to 5 resumes."), { statusCode: 400 });
        const result = await client.query(
            `INSERT INTO jobpilot.user_resumes
                (user_id, file_name, display_name, target_job_title, mime_type, file_size, file_data,
                 extracted_text, extracted_at, extraction_error, is_primary)
             VALUES ($1::UUID, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOT EXISTS (
                 SELECT 1 FROM jobpilot.user_resumes WHERE user_id=$1::UUID AND is_primary
             ))
             RETURNING ${summaryColumns}`,
            [
                userId, resume.fileName, resume.displayName, resume.targetJobTitle || null,
                resume.mimeType, resume.fileSize, resume.fileData,
                resume.extractedText || null, resume.extractedAt || null, resume.extractionError || null,
            ]
        );
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const update = async (userId, id, values) => {
    const result = await pool.query(
        `UPDATE jobpilot.user_resumes
         SET display_name=$1, target_job_title=$2
         WHERE id=$3::UUID AND user_id=$4::UUID
         RETURNING ${summaryColumns}`,
        [values.displayName, values.targetJobTitle || null, id, userId]
    );
    return result.rows[0];
};

const setPrimary = async (userId, id) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const exists = await client.query(
            "SELECT id FROM jobpilot.user_resumes WHERE id=$1::UUID AND user_id=$2::UUID FOR UPDATE",
            [id, userId]
        );
        if (!exists.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }
        await client.query("UPDATE jobpilot.user_resumes SET is_primary=false WHERE user_id=$1::UUID AND is_primary", [userId]);
        const result = await client.query(
            `UPDATE jobpilot.user_resumes SET is_primary=true WHERE id=$1::UUID AND user_id=$2::UUID
             RETURNING ${summaryColumns}`,
            [id, userId]
        );
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const findFile = async (userId, id) => {
    const result = await pool.query(
        `SELECT file_name, mime_type, file_data FROM jobpilot.user_resumes
         WHERE id=$1::UUID AND user_id=$2::UUID`,
        [id, userId]
    );
    return result.rows[0];
};

const findPrimaryFile = async userId => {
    const result = await pool.query(
        `SELECT id, file_name, display_name, target_job_title, mime_type, file_data,
                extracted_text, extracted_at, extraction_error
         FROM jobpilot.user_resumes
         WHERE user_id=$1::UUID AND is_primary=true`,
        [userId]
    );
    return result.rows[0];
};

const saveExtractedText = async (userId, id, { text, error }) => {
    const result = await pool.query(
        `UPDATE jobpilot.user_resumes
         SET extracted_text=$1, extracted_at=NOW(), extraction_error=$2
         WHERE id=$3::UUID AND user_id=$4::UUID
         RETURNING extracted_text, extracted_at, extraction_error`,
        [text || null, error || null, id, userId]
    );
    return result.rows[0] || null;
};

const remove = async (userId, id) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const deleted = await client.query(
            `DELETE FROM jobpilot.user_resumes WHERE id=$1::UUID AND user_id=$2::UUID
             RETURNING is_primary`,
            [id, userId]
        );
        if (!deleted.rowCount) {
            await client.query("ROLLBACK");
            return false;
        }
        if (deleted.rows[0].is_primary) {
            await client.query(
                `UPDATE jobpilot.user_resumes SET is_primary=true
                 WHERE id=(SELECT id FROM jobpilot.user_resumes WHERE user_id=$1::UUID ORDER BY updated_at DESC LIMIT 1)`,
                [userId]
            );
        }
        await client.query("COMMIT");
        return true;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { listByUserId, create, update, setPrimary, findFile, findPrimaryFile, saveExtractedText, remove };
