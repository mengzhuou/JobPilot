const { pool } = require('../config/postgres');
const { normalizeQuestion, canRemember, scopeFor, cleanValues } = require('../services/confirmedAnswerPolicy');

const findForFields = async (userId, fields, jobUrl) => {
    const questions = fields.filter(canRemember).map(field => normalizeQuestion(field.label));
    if (!questions.length) return [];
    const result = await pool.query(`SELECT normalized_question, scope, answer_values
        FROM jobpilot.confirmed_autofill_answers
        WHERE user_id=$1::UUID AND normalized_question=ANY($2::TEXT[])`, [userId, questions]);
    return result.rows.filter(row => row.scope === scopeFor(row.normalized_question, jobUrl));
};
const rememberMany = async (userId, answers, jobUrl) => {
    const client = await pool.connect();
    let saved = 0;
    try {
        await client.query('BEGIN');
        for (const answer of answers.slice(0, 30)) {
            if (!answer || typeof answer !== 'object') continue;
            const values = cleanValues(answer.values);
            const scope = scopeFor(answer.question, jobUrl);
            if (!canRemember(answer) || !values || !scope) continue;
            const question = normalizeQuestion(answer.question);
            if (!values.length) {
                await client.query(`DELETE FROM jobpilot.confirmed_autofill_answers
                    WHERE user_id=$1::UUID AND normalized_question=$2 AND scope=$3`, [userId, question, scope]);
            } else {
                await client.query(`INSERT INTO jobpilot.confirmed_autofill_answers
                    (user_id, normalized_question, scope, question, answer_values)
                    VALUES ($1::UUID,$2,$3,$4,$5::JSONB)
                    ON CONFLICT (user_id, normalized_question, scope) DO UPDATE SET
                        question=EXCLUDED.question, answer_values=EXCLUDED.answer_values, updated_at=NOW()`,
                [userId, question, scope, String(answer.question).slice(0,500), JSON.stringify(values)]);
            }
            saved += 1;
        }
        await client.query('COMMIT');
        return saved;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
};
const forgetAll = userId => pool.query('DELETE FROM jobpilot.confirmed_autofill_answers WHERE user_id=$1::UUID', [userId]);
module.exports = { findForFields, rememberMany, forgetAll };
