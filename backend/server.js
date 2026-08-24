// server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const applicationRoutes = require("./routes/applicationRoutes");
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