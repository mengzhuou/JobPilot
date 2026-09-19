// server.js

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(
        __dirname,
        ".env"
    )
});


if (
    !process.env.APPLICATION_USERNAME ||
    !process.env.APPLICATION_PASSWORD
) {
    console.warn(
        "Candidate login credentials are not configured in backend/.env."
    );
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.SESSION_SECRET) {
    throw new Error(
        "GOOGLE_CLIENT_ID and SESSION_SECRET are required in backend/.env."
    );
}

const express = require("express");
const cors = require("cors");

const applicationRoutes = require("./routes/applicationRoutes");
const jobPostingRoutes = require("./routes/jobPostingRoutes");
const authRoutes = require("./routes/authRoutes");
const jobApplicationRoutes = require("./routes/jobApplicationRoutes");
const jobPreferenceRoutes = require("./routes/jobPreferenceRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const jobModerationRoutes = require("./routes/jobModerationRoutes");
const jobAnalyticsRoutes = require("./routes/jobAnalyticsRoutes");
const userProfileRoutes = require("./routes/userProfileRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const errorHandler = require("./middleware/errorHandler");
const { verifyDatabaseConnection } = require("./config/postgres");
const { migrateDatabase } = require("./scripts/migrateDatabase");
const cookieParser = require("cookie-parser");

const app = express();

const PORT = process.env.PORT || 3500;


// ====================
// Middleware
// ====================

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());


// ====================
// Routes
// ====================

app.use("/api/auth", authRoutes);
app.use("/api/job-applications", jobApplicationRoutes);
app.use("/api/job-preferences", jobPreferenceRoutes);
app.use("/api/filter-presets", require("./routes/filterPresetRoutes"));
app.use("/api/feedback", feedbackRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/job-postings", jobPostingRoutes);
app.use("/api/job-moderation", jobModerationRoutes);
app.use("/api/job-analytics", jobAnalyticsRoutes);
app.use("/api/profile", userProfileRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/ai-autofill", require("./routes/aiAutofillReviewRoutes"));


// ====================
// Error Handler
// ====================

app.use(errorHandler);


// ====================
// Start Server
// ====================

const startServer = async () => {
    try {
        await migrateDatabase();
        const connection = await verifyDatabaseConnection();

        console.log(`PostgreSQL connected: ${connection.database}`);

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Unable to connect to PostgreSQL:", error.message);
        process.exit(1);
    }
};

startServer();
