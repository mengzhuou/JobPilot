const {
    createOrRefreshApplication,
    getApplicationSummary,
    listApplications,
    updateApplication,
} = require("../repositories/jobApplicationRepository");

const confirmApplication = async (req, res, next) => {
    try {
        if (!req.body.jobUrl) {
            return res.status(400).json({ message: "Job URL is required" });
        }
        const application = await createOrRefreshApplication(
            req.auth.userId,
            req.body
        );
        return res.status(201).json({ application });
    } catch (error) {
        return next(error);
    }
};

const getApplications = async (req, res, next) => {
    try {
        return res.status(200).json(
            await listApplications(req.auth.userId, req.query)
        );
    } catch (error) {
        return next(error);
    }
};

const getSummary = async (req, res, next) => {
    try {
        return res.status(200).json({
            summary: await getApplicationSummary(req.auth.userId),
        });
    } catch (error) {
        return next(error);
    }
};

const updateHistoryItem = async (req, res, next) => {
    try {
        const application = await updateApplication(
            req.auth.userId,
            req.params.id,
            req.body
        );

        if (!application) {
            return res.status(404).json({ message: "Application not found" });
        }

        return res.status(200).json({ application });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return next(error);
    }
};

module.exports = {
    confirmApplication,
    getApplications,
    getSummary,
    updateHistoryItem,
};
