const crypto = require("crypto");
const { pool } = require("../config/postgres");

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "been", "can", "do", "for", "from", "have", "how", "i", "in", "is", "it", "of", "on", "or", "our", "that", "the", "their", "this", "to", "us", "was", "we", "what", "when", "where", "why", "with", "you", "your"]);
const normalizeQuestion = value => String(value || "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().slice(0, 500);
const canonicalTerm = term => {
    if (/^(client|clients|customer|customers|user|users)$/.test(term)) return "client";
    if (/^(need|needs|requirement|requirements)$/.test(term)) return "requirement";
    if (/^(gather|gathered|gathering|understand|understood|discover|discovered|discovery)$/.test(term)) return "discover";
    if (/^(work|worked|working)$/.test(term)) return "work";
    if (/^(project|projects|story|stories|example|examples)$/.test(term)) return "story";
    return term.replace(/(ing|ed|s)$/i, "");
};
const terms = value => new Set(normalizeQuestion(value).split(/\s+/)
    .filter(term => term.length > 1 && !STOP_WORDS.has(term))
    .map(canonicalTerm));
const similarity = (left, right) => {
    const a = terms(left);
    const b = terms(right);
    if (!a.size || !b.size) return 0;
    const overlap = [...a].filter(term => b.has(term)).length;
    const containment = overlap / Math.min(a.size, b.size);
    const union = new Set([...a, ...b]).size;
    return (overlap / union) * 0.6 + containment * 0.4;
};

const findRelevant = async (userId, questions, limit = 12) => {
    const result = await pool.query(
        `SELECT id,question,user_context,accepted_answer,job_title,company,use_count,updated_at
         FROM jobpilot.application_answer_memories
         WHERE user_id=$1::UUID
         ORDER BY updated_at DESC
         LIMIT 150`,
        [userId]
    );
    return result.rows
        .map(memory => ({
            ...memory,
            score: Math.max(...questions.map(question => similarity(question, memory.question))),
        }))
        .filter(memory => memory.score >= 0.18)
        .sort((a, b) => b.score - a.score || new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, limit);
};

const rememberMany = async (userId, memories) => {
    if (!memories.length) return [];
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const saved = [];
        for (const memory of memories) {
            const question = String(memory.question || "").trim().slice(0, 500);
            const acceptedAnswer = String(memory.acceptedAnswer || "").trim().slice(0, 1200);
            if (!question || !acceptedAnswer) continue;
            const userContext = String(memory.userContext || "").trim().slice(0, 2000);
            const normalizedQuestion = normalizeQuestion(question);
            const contextHash = crypto.createHash("sha256").update(userContext || acceptedAnswer).digest("hex");
            const result = await client.query(
                `INSERT INTO jobpilot.application_answer_memories
                    (user_id,question,normalized_question,context_hash,user_context,accepted_answer,job_title,company)
                 VALUES ($1::UUID,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (user_id,normalized_question,context_hash) DO UPDATE SET
                    question=EXCLUDED.question,
                    user_context=EXCLUDED.user_context,
                    accepted_answer=EXCLUDED.accepted_answer,
                    job_title=EXCLUDED.job_title,
                    company=EXCLUDED.company
                 RETURNING *`,
                [
                    userId, question, normalizedQuestion, contextHash, userContext, acceptedAnswer,
                    String(memory.jobTitle || "").slice(0, 300) || null,
                    String(memory.company || "").slice(0, 300) || null,
                ]
            );
            saved.push(result.rows[0]);
        }
        await client.query("COMMIT");
        return saved;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const markUsed = async ids => {
    if (!ids.length) return;
    await pool.query(
        `UPDATE jobpilot.application_answer_memories
         SET use_count=use_count+1,last_used_at=NOW()
         WHERE id=ANY($1::UUID[])`,
        [ids]
    );
};

module.exports = { findRelevant, rememberMany, markUsed, normalizeQuestion, similarity };
