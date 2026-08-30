const { pool } = require("../config/postgres");

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
            created_at,
            last_login_at
        FROM jobpilot.users
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
};

module.exports = {
    findUserById,
    upsertGoogleUser,
};
