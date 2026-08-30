const asyncHandler = require("express-async-handler");
const {
    getActiveJobPostings,
    enqueueSourceJobDiscovery,
    getSourceDiscoveryTask,
} = require("../services/jobPostingService");
const { addCustomCareerSource, listCustomCareerSources } = require("../repositories/customCareerSourceRepository");
const { getPreferenceSignals } = require("../repositories/jobPreferenceRepository");
const companyCareerSources = require("../services/companyCareerSources");
const {
    getAppliedJobKeys,
    getJobApplicationSignals,
} = require("../repositories/jobApplicationRepository");

const listActiveJobPostings = asyncHandler(async (req, res) => {
    const appliedJobKeys = await getAppliedJobKeys(req.auth.userId);
    const results = await getActiveJobPostings({
        query: req.query.query,
        location: req.query.location,
        refresh: req.query.refresh === "true",
        page: req.query.page,
        limit: req.query.limit,
        company: req.query.company,
        excludeCompany: req.query.excludeCompany,
        remoteOnly: req.query.remoteOnly === "true",
        keywords: req.query.keywords,
        specialization: req.query.specialization,
        eligibility: req.query.eligibility,
        employmentType: req.query.employmentType,
        applicationState: req.query.applicationState,
        appliedJobKeys,
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
    const discovery = enqueueSourceJobDiscovery(source);
    res.status(202).json({ source, discovery });
});

const getCareerSourceDiscovery = asyncHandler(async (req, res) => {
    const discovery = getSourceDiscoveryTask(req.params.id);
    if (!discovery) return res.status(404).json({ message: "This source-discovery task has expired or does not exist." });
    res.json({ discovery });
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
    getCareerSourceDiscovery,
    listCareerSources,
};
