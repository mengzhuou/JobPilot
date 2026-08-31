const asyncHandler = require("express-async-handler");
const {
    getActiveJobPostings,
    addSourceJobsToCache,
    enqueueSourceJobDiscovery,
    getSourceDiscoveryTask,
    inspectCareerSource,
    discoverCareerSource,
} = require("../services/jobPostingService");
const { addResolvedCareerSource, listCustomCareerSources, resolveSource } = require("../repositories/customCareerSourceRepository");
const { getPreferenceSignals } = require("../repositories/jobPreferenceRepository");
const companyCareerSources = require("../services/companyCareerSources");
const {
    getAppliedJobKeys,
    getJobApplicationSignals,
} = require("../repositories/jobApplicationRepository");

const normalizeCompanyName = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const ensureCompanyIsNew = async input => {
    const rawInput = String(input || "").trim();
    if (!rawInput || /^https?:\/\//i.test(rawInput) || /^[^\s]+\.[a-z]{2,}/i.test(rawInput)) return;
    const normalizedInput = normalizeCompanyName(rawInput);
    const customSources = await listCustomCareerSources();
    const existing = [...companyCareerSources, ...customSources].find(source =>
        normalizeCompanyName(source.company) === normalizedInput
    );
    if (existing) {
        const error = new Error(`${existing.company} is already in the company resource list.`);
        error.statusCode = 409;
        throw error;
    }
};

const listActiveJobPostings = asyncHandler(async (req, res) => {
    const applicationState = req.query.applicationState || "all";
    const appliedJobKeys = applicationState === "all"
        ? new Set()
        : await getAppliedJobKeys(req.auth.userId);
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
        applicationState,
        appliedJobKeys,
        postedWithin: req.query.postedWithin,
        locations: req.query.locations,
        experienceRange: req.query.experienceRange,
    });

    const [signals, preferences] = await Promise.all([
        getJobApplicationSignals(req.auth.userId, results.jobs || []),
        getPreferenceSignals(req.auth.userId, results.jobs || []),
    ]);
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

const resolveAndInspectCareerSource = async input => {
    try {
        const source = resolveSource(input);
        const hostname = new URL(source.careerUrl).hostname;
        if (source.provider !== "generic" || hostname.includes(".")) {
            return inspectCareerSource(source);
        }
    } catch (error) {
        if (/^https?:\/\//i.test(String(input || "").trim())) throw error;
    }
    return discoverCareerSource(String(input || "").trim());
};

const createCareerSource = asyncHandler(async (req, res) => {
    await ensureCompanyIsNew(req.body.input);
    const inspection = await resolveAndInspectCareerSource(req.body.input);
    const resolvedSource = inspection.source;
    const source = await addResolvedCareerSource(req.auth.userId, resolvedSource, req.body.input);
    const cacheResult = await addSourceJobsToCache(source, inspection.discoveredJobs);
    res.status(201).json({ source, discovery: {
        company: source.company,
        status: "complete",
        jobsFound: inspection.jobsFound,
        newJobsAdded: cacheResult.newJobsAdded,
    } });
});

const previewCareerSource = asyncHandler(async (req, res) => {
    await ensureCompanyIsNew(req.body.input);
    const inspection = await resolveAndInspectCareerSource(req.body.input);
    const source = inspection.source;
    res.json({ preview: {
        company: source.company,
        careerUrl: source.careerUrl,
        provider: source.provider,
        jobsFound: inspection.jobsFound,
        newJobsFound: inspection.newJobsFound,
    } });
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
    previewCareerSource,
    getCareerSourceDiscovery,
    listCareerSources,
};
