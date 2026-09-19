import axios from "axios";
export const getProfileLocations = async params => (await api.get('/api/profile/locations', { params })).data.options;
export const getFilterPresets = async () => (await api.get('/api/filter-presets')).data.presets;
export const saveFilterPreset = async (name, filters) => (await api.post('/api/filter-presets', { name, filters })).data.preset;
export const getJobPlatforms = async () => (await api.get('/api/job-postings/platforms')).data.platforms;

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const api = axios.create({
    baseURL: BACKEND_URL,
    withCredentials: true,
});

const openAndFillApplication = async (application) => {
    try {
        const res = await api.post(
            "/api/applications/start",
            application,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        return res.data;
    } catch (error) {
        console.error(
            "Error opening and filling application:",
            error
        );
        throw error;
    }
};

const stopApplication = async () => {
    try {
        const res = await api.post("/api/applications/stop");

        return res.data;
    } catch (error) {
        console.error("Error stopping application:", error);
        throw error;
    }
};

const getApplicationStatus = async () => {
    const res = await api.get("/api/applications/status");

    return res.data;
};

const getActiveJobPostings = async ({
    query = "software engineer",
    location = "",
    refresh = false,
    page = 1,
    limit = 30,
    company = "",
    excludeCompany = "",
    remoteOnly = false,
    keywords = "",
    excludeFocuses = [],
    excludeEligibility = [],
    excludeJobTypes = [],
    applicationState = "all",
    postedWithin = "all",
    locations = [],
    excludeLevels = [],
    includeLevels = [],
    excludePlatforms = [],
    matchLevel = "all",
} = {}) => {
    const res = await api.get(
        "/api/job-postings",
        {
            params: {
                query,
                location,
                refresh,
                page,
                limit,
                company,
                excludeCompany,
                remoteOnly,
                keywords,
                excludeFocuses: excludeFocuses.join(","),
                excludeEligibility: excludeEligibility.join(","),
                excludeJobTypes: excludeJobTypes.join(","),
                applicationState,
                postedWithin,
                locations: locations.join(","),
                excludeLevels: excludeLevels.join(","),
                includeLevels: includeLevels.join(","),
                excludePlatforms: excludePlatforms.join(","),
                matchLevel,
            },
        }
    );

    return res.data;
};

const addCareerSource = async input => {
    const res = await api.post("/api/job-postings/sources", { input });
    return res.data;
};
const previewCareerSource = async input => (
    await api.post("/api/job-postings/sources/preview", { input })
).data.preview;
const getCareerSourceDiscovery = async id => (
    await api.get(`/api/job-postings/sources/discovery/${id}`)
).data.discovery;
const getCareerSources = async () => (await api.get("/api/job-postings/sources")).data.sources;
const setJobPreference = async job => (await api.post("/api/job-preferences", job)).data.job;
const getJobPreferences = async state => (await api.get("/api/job-preferences", { params:{state} })).data.jobs;
const deleteJobPreference = async id => { await api.delete(`/api/job-preferences/${id}`); };
const submitFeedback = async data => (await api.post("/api/feedback",data)).data.feedback;
const getFeedback = async () => (await api.get("/api/feedback")).data.feedback;
const updateFeedback = async (id,data) => (await api.patch(`/api/feedback/${id}`,data)).data.feedback;
const deleteFeedback = async id => { await api.delete(`/api/feedback/${id}`); };
const createManualApplication = async data => (await api.post("/api/job-applications/manual",data)).data.application;
const reportJob = async data => (await api.post("/api/job-moderation/reports",data)).data.report;
const getJobReportStatus = async jobUrl => (await api.get("/api/job-moderation/reports/status",{params:{jobUrl}})).data.reported;
const getJobModeration = async () => (await api.get("/api/job-moderation")).data.jobs;
const updateJobModeration = async data => (await api.put("/api/job-moderation",data)).data.job;
const getJobMarketAnalytics = async () => (await api.get("/api/job-analytics/market")).data.snapshot;
const refreshJobMarketAnalytics = async () => (await api.post("/api/job-analytics/market/refresh")).data.snapshot;
const getUserProfile = async () => (await api.get("/api/profile")).data.profile;
const updateUserProfileSection = async (section, value) => (await api.patch("/api/profile", { section, value })).data.profile;

const getJobApplicationHistory = async ({
    status = "",
    search = "",
    page = 1,
    limit = 12,
    dateRange = "all",
} = {}) => {
    const res = await api.get("/api/job-applications", {
        params: { status, search, page, limit, dateRange },
    });
    return res.data;
};

const getJobApplicationSummary = async () => {
    const res = await api.get("/api/job-applications/summary");
    return res.data.summary;
};

const updateJobApplication = async (id, changes) => {
    const res = await api.patch(`/api/job-applications/${id}`, changes);
    return res.data.application;
};

const confirmJobApplication = async application => {
    const res = await api.post("/api/job-applications/confirm", application);
    return res.data.application;
};

const deleteJobApplication = async id => {
    await api.delete(`/api/job-applications/${id}`);
};

export {
    openAndFillApplication,
    stopApplication,
    getApplicationStatus,
    getActiveJobPostings,
    addCareerSource,
    previewCareerSource,
    getCareerSourceDiscovery,
    getCareerSources,
    setJobPreference,
    getJobPreferences,
    deleteJobPreference,
    submitFeedback,
    getFeedback,
    updateFeedback,
    deleteFeedback,
    createManualApplication,
    getJobApplicationHistory,
    getJobApplicationSummary,
    updateJobApplication,
    confirmJobApplication,
    deleteJobApplication,
    reportJob,
    getJobReportStatus,
    getJobModeration,
    updateJobModeration,
    getJobMarketAnalytics,
    refreshJobMarketAnalytics,
    getUserProfile,
    updateUserProfileSection,
};
