const express = require("express");
const {
    createCareerSource,
    getCareerSourceDiscovery,
    listCareerSources,
    listActiveJobPostings,
    previewCareerSource,
} = require("../controllers/jobPostingController");

const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");

router.use(requireAuth);
router.get("/", listActiveJobPostings);
router.get("/sources", requireAdmin, listCareerSources);
router.post("/sources", requireAdmin, createCareerSource);
router.post("/sources/preview", requireAdmin, previewCareerSource);
router.get("/sources/discovery/:id", requireAdmin, getCareerSourceDiscovery);

module.exports = router;
