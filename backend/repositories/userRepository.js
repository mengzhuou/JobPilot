const { pool } = require("../config/postgres");
const { randomUUID } = require('crypto');

const createPasswordUser = async ({ email, firstName, lastName, passwordHash }) => {
    const result = await pool.query(`INSERT INTO jobpilot.users
        (auth_provider, provider_user_id, email, display_name, first_name, last_name, password_hash, last_login_at)
        VALUES ('password', $1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
        [randomUUID(), email, `${firstName} ${lastName}`, firstName, lastName, passwordHash]);
    return result.rows[0];
};
const findUserByEmail = async email => {
    const result = await pool.query('SELECT * FROM jobpilot.users WHERE LOWER(email)=$1', [email]);
    return result.rows[0] || null;
};
const recordLogin = id => pool.query('UPDATE jobpilot.users SET last_login_at=NOW() WHERE id=$1', [id]);

const upsertGoogleUser = async profile => {
    const result = await pool.query(
        `
        INSERT INTO jobpilot.users (
            auth_provider,
            provider_user_id,
            email,
            display_name,
            first_name,
            last_name,
            picture_url,
            last_login_at
        )
        VALUES ('google', $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (auth_provider, provider_user_id)
        DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            picture_url = EXCLUDED.picture_url,
            last_login_at = NOW()
        RETURNING *
        `,
        [
            profile.sub,
            profile.email,
            profile.name || null,
            profile.given_name || null,
            profile.family_name || null,
            profile.picture || null,
        ]
    );

    return result.rows[0];
};

const findUserById = async id => {
    const result = await pool.query(
        `
        SELECT
            id,
            email,
            display_name,
            first_name,
            last_name,
            picture_url,
            role,
            created_at,
            last_login_at,
            onboarding
        FROM jobpilot.users
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
};

module.exports = {
    updateOnboarding: async (id, state) => {
        const result = await pool.query(`UPDATE jobpilot.users SET onboarding = CASE
            WHEN onboarding->>'status' IN ('completed','skipped') THEN onboarding
            ELSE $2::JSONB END WHERE id=$1 RETURNING onboarding`,[id,JSON.stringify(state)]);
        return result.rows[0]?.onboarding;
    },
    createPasswordUser,
    findUserByEmail,
    recordLogin,
    findUserById,
    upsertGoogleUser,
};
