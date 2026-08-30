const express = require("express");
const {
    listActiveJobPostings,
} = require("../controllers/jobPostingController");

const router = express.Router();

router.get("/", listActiveJobPostings);

module.exports = router;
