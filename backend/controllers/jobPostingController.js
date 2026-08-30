const asyncHandler = require("express-async-handler");
const {
    getActiveJobPostings,
} = require("../services/jobPostingService");
const {
    getJobApplicationSignals,
} = require("../repositories/jobApplicationRepository");

const listActiveJobPostings = asyncHandler(async (req, res) => {
    const results = await getActiveJobPostings({
        query: req.query.query,
        location: req.query.location,
        refresh: req.query.refresh === "true",
        page: req.query.page,
        limit: req.query.limit,
    });

    const signals = await getJobApplicationSignals(
        req.auth.userId,
        results.jobs || []
    );
    results.jobs = (results.jobs || []).map(job => {
        const signal = signals.get(`url:${job.url}`)
            || signals.get(`id:${String(job.id || "")}`)
            || { applicantCount: 0, currentUserApplied: false };
        return { ...job, ...signal };
    });

    res.json(results);
});

module.exports = {
    listActiveJobPostings,
};
