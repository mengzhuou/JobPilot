import axios from "axios";

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
    specialization = "all",
    eligibility = "all",
    employmentType = "all",
    applicationState = "all",
    postedWithin = "all",
    locations = [],
    experienceRange = "all",
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
                specialization,
                eligibility,
                employmentType,
                applicationState,
                postedWithin,
                locations: locations.join(","),
                experienceRange,
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
};
