const asyncHandler = require("express-async-handler");
const {
    getActiveJobPostings,
} = require("../services/jobPostingService");

const listActiveJobPostings = asyncHandler(async (req, res) => {
    const results = await getActiveJobPostings({
        query: req.query.query,
        location: req.query.location,
        refresh: req.query.refresh === "true",
    });

    res.json(results);
});

module.exports = {
    listActiveJobPostings,
};
