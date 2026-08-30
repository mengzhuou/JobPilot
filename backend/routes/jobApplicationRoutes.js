const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
    confirmApplication,
    createManualHistoryItem,
    deleteHistoryItem,
    getApplications,
    getSummary,
    updateHistoryItem,
} = require("../controllers/jobApplicationController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getApplications);
router.get("/summary", getSummary);
router.post("/confirm", confirmApplication);
router.post("/manual", createManualHistoryItem);
router.delete("/:id", deleteHistoryItem);
router.patch("/:id", updateHistoryItem);

module.exports = router;
