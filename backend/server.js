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

const express = require("express");
const cors = require("cors");

const applicationRoutes = require("./routes/applicationRoutes");
const jobPostingRoutes = require("./routes/jobPostingRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const PORT = process.env.PORT || 3500;


// ====================
// Middleware
// ====================

app.use(cors());

app.use(express.json());


// ====================
// Routes
// ====================

app.use("/api/applications", applicationRoutes);
app.use("/api/job-postings", jobPostingRoutes);


// ====================
// Error Handler
// ====================

app.use(errorHandler);


// ====================
// Start Server
// ====================

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
