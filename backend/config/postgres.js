const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL is required. Add it to backend/.env before starting JobPilot."
    );
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : false,
});

pool.on("error", error => {
    console.error("Unexpected PostgreSQL pool error:", error);
});

const verifyDatabaseConnection = async () => {
    const result = await pool.query(
        "SELECT current_database() AS database, NOW() AS connected_at"
    );

    return result.rows[0];
};

module.exports = {
    pool,
    verifyDatabaseConnection,
};
