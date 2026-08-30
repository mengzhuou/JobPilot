const asyncHandler = require("express-async-handler");
const {
    getActiveJobPostings,
    invalidateJobCache,
} = require("../services/jobPostingService");
const { addCustomCareerSource, listCustomCareerSources } = require("../repositories/customCareerSourceRepository");
const { getPreferenceSignals } = require("../repositories/jobPreferenceRepository");
const companyCareerSources = require("../services/companyCareerSources");
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
    const preferences = await getPreferenceSignals(req.auth.userId, results.jobs || []);
    results.jobs = (results.jobs || []).map(job => {
        const signal = signals.get(`url:${job.url}`)
            || signals.get(`id:${String(job.id || "")}`)
            || { applicantCount: 0, currentUserApplied: false };
        const preferenceState = preferences.get(`url:${job.url}`)
            || preferences.get(`id:${String(job.id || "")}`)
            || null;
        return { ...job, ...signal,
            currentUserSaved: preferenceState === "saved",
            currentUserBlocked: preferenceState === "blocked" };
    });

    res.json(results);
});

const createCareerSource = asyncHandler(async (req, res) => {
    const source = await addCustomCareerSource(req.auth.userId, req.body.input);
    invalidateJobCache();
    res.status(201).json({ source });
});

const listCareerSources = asyncHandler(async (req, res) => {
    const custom = await listCustomCareerSources();
    res.json({ sources: [
        ...companyCareerSources.map(source => ({ ...source, type: "curated" })),
        ...custom.map(source => ({ ...source, type: "community" })),
    ] });
});

module.exports = {
    listActiveJobPostings,
    createCareerSource,
    listCareerSources,
};
