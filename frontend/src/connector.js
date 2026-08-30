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
            },
        }
    );

    return res.data;
};

const getJobApplicationHistory = async ({
    status = "",
    search = "",
    page = 1,
    limit = 12,
} = {}) => {
    const res = await api.get("/api/job-applications", {
        params: { status, search, page, limit },
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

export {
    openAndFillApplication,
    stopApplication,
    getApplicationStatus,
    getActiveJobPostings,
    getJobApplicationHistory,
    getJobApplicationSummary,
    updateJobApplication,
    confirmJobApplication,
};
