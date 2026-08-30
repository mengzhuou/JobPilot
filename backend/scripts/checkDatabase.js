const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../.env"),
});

const {
    pool,
    verifyDatabaseConnection,
} = require("../config/postgres");

const checkDatabase = async () => {
    try {
        const connection = await verifyDatabaseConnection();
        const tableResult = await pool.query(`
            SELECT to_regclass('jobpilot.users') AS users_table
        `);

        console.log("PostgreSQL connection successful:", connection);
        console.log(
            "Users table:",
            tableResult.rows[0].users_table || "not migrated"
        );
    } finally {
        await pool.end();
    }
};

checkDatabase().catch(error => {
    console.error("PostgreSQL connection failed:", error);
    process.exitCode = 1;
});
