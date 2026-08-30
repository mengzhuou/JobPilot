const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../.env"),
});

const { pool } = require("../config/postgres");

const migrationsDirectory = path.resolve(__dirname, "../db/migrations");

const migrateDatabase = async ({ closePool = false } = {}) => {
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const files = fs
            .readdirSync(migrationsDirectory)
            .filter(filename => filename.endsWith(".sql"))
            .sort();

        for (const filename of files) {
            const existingMigration = await client.query(
                "SELECT 1 FROM public.schema_migrations WHERE filename = $1",
                [filename]
            );

            if (existingMigration.rowCount > 0) {
                console.log(`Already applied: ${filename}`);
                continue;
            }

            const sql = fs.readFileSync(
                path.join(migrationsDirectory, filename),
                "utf8"
            );

            await client.query("BEGIN");

            try {
                await client.query(sql);
                await client.query(
                    "INSERT INTO public.schema_migrations (filename) VALUES ($1)",
                    [filename]
                );
                await client.query("COMMIT");
                console.log(`Applied: ${filename}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }
    } finally {
        client.release();
        if (closePool) await pool.end();
    }
};

if (require.main === module) {
    migrateDatabase({ closePool: true }).catch(error => {
        console.error("Database migration failed:", error);
        process.exitCode = 1;
    });
}

module.exports = { migrateDatabase };
