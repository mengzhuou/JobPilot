const express = require("express");
const {
    listActiveJobPostings,
} = require("../controllers/jobPostingController");

const router = express.Router();
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);
router.get("/", listActiveJobPostings);

module.exports = router;
