const crypto = require("crypto");
const { pool } = require("../config/postgres");

const PAIRING_CODE_TTL_MINUTES = 10;
const TOKEN_TTL_DAYS = 90;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const hashSecret = value => crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");

const generatePairingCode = () => {
    const bytes = crypto.randomBytes(8);
    const characters = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
    return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
};

const normalizePairingCode = code => String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const createPairingCode = async userId => {
    const code = generatePairingCode();
    const normalized = normalizePairingCode(code);
    await pool.query(
        `DELETE FROM jobpilot.extension_pairing_codes
         WHERE user_id=$1::UUID OR expires_at <= NOW() OR consumed_at IS NOT NULL`,
        [userId]
    );
    const result = await pool.query(
        `INSERT INTO jobpilot.extension_pairing_codes (user_id, code_hash, expires_at)
         VALUES ($1::UUID, $2, NOW() + ($3::TEXT || ' minutes')::INTERVAL)
         RETURNING expires_at`,
        [userId, hashSecret(normalized), PAIRING_CODE_TTL_MINUTES]
    );
    return { code, expiresAt: result.rows[0].expires_at };
};

const exchangePairingCode = async (code, deviceName = "Chrome extension") => {
    const normalized = normalizePairingCode(code);
    if (normalized.length !== 8) return null;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const pairingResult = await client.query(
            `SELECT id, user_id
             FROM jobpilot.extension_pairing_codes
             WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at > NOW()
             FOR UPDATE`,
            [hashSecret(normalized)]
        );
        const pairing = pairingResult.rows[0];
        if (!pairing) {
            await client.query("ROLLBACK");
            return null;
        }

        const token = `jpe_${crypto.randomBytes(32).toString("base64url")}`;
        const tokenResult = await client.query(
            `INSERT INTO jobpilot.extension_tokens
                (user_id, token_hash, device_name, expires_at)
             VALUES ($1::UUID, $2, $3, NOW() + ($4::TEXT || ' days')::INTERVAL)
             RETURNING id, expires_at`,
            [pairing.user_id, hashSecret(token), deviceName.slice(0, 100), TOKEN_TTL_DAYS]
        );
        await client.query(
            "UPDATE jobpilot.extension_pairing_codes SET consumed_at=NOW() WHERE id=$1::UUID",
            [pairing.id]
        );
        await client.query("COMMIT");
        return {
            token,
            tokenId: tokenResult.rows[0].id,
            userId: pairing.user_id,
            expiresAt: tokenResult.rows[0].expires_at,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const findActiveToken = async token => {
    if (!String(token || "").startsWith("jpe_")) return null;
    const result = await pool.query(
        `UPDATE jobpilot.extension_tokens
         SET last_used_at=NOW()
         WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()
         RETURNING id, user_id, device_name, expires_at`,
        [hashSecret(token)]
    );
    return result.rows[0] || null;
};

const listConnections = async userId => {
    const result = await pool.query(
        `SELECT id, device_name, expires_at, last_used_at, created_at
         FROM jobpilot.extension_tokens
         WHERE user_id=$1::UUID AND revoked_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
};

const revokeConnection = async (userId, tokenId) => {
    const result = await pool.query(
        `UPDATE jobpilot.extension_tokens SET revoked_at=NOW()
         WHERE id=$1::UUID AND user_id=$2::UUID AND revoked_at IS NULL
         RETURNING id`,
        [tokenId, userId]
    );
    return Boolean(result.rowCount);
};

const revokeCurrentToken = async tokenId => {
    const result = await pool.query(
        `UPDATE jobpilot.extension_tokens SET revoked_at=NOW()
         WHERE id=$1::UUID AND revoked_at IS NULL RETURNING id`,
        [tokenId]
    );
    return Boolean(result.rowCount);
};

module.exports = {
    createPairingCode,
    exchangePairingCode,
    findActiveToken,
    listConnections,
    revokeConnection,
    revokeCurrentToken,
    hashSecret,
    normalizePairingCode,
};
