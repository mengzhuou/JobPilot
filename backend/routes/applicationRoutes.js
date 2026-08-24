// applicationRoutes.js

const express = require("express");
const router = express.Router();
const applicationController = require("../controllers/applicationController");
const limiter = require('../middleware/rateLimiter');


router.post("/start", limiter, applicationController.startApplication);


module.exports = router;