// applicationController.js

const asyncHandler = require("express-async-handler");
const {
    startApplicationAgent,
    stopApplicationAgent,
    isApplicationAgentRunning
} = require("../services/applicationAgent");
const resumeRepository = require("../repositories/resumeRepository");

const startApplication = asyncHandler(async (req, res, next) => {
    try {
        const { jobUrl } = req.body;

        if (!jobUrl) {
            return res.status(400).json({
                message: "Job URL is required"
            });
        }

        const primaryResume = await resumeRepository.findPrimaryFile(req.auth.userId);
        if (!primaryResume) {
            return res.status(400).json({
                message: "Choose a primary résumé in Resumes before starting Autofill."
            });
        }

        await startApplicationAgent(jobUrl, { resume: primaryResume });

        res.status(200).json({
            message: "Application agent started"
        });

    } catch (error) {
        next(error);
    }
});

const stopApplication = asyncHandler(async (req, res, next) => {
    try {
        await stopApplicationAgent();

        res.status(200).json({
            message: "Application agent stopped"
        });

    } catch (error) {
        next(error);
    }
});


const getApplicationStatus = asyncHandler(async (req, res) => {
    res.status(200).json({
        running: isApplicationAgentRunning(),
        status: isApplicationAgentRunning()
            ? "running"
            : "stopped"
    });
});


module.exports = {
    startApplication,
    stopApplication,
    getApplicationStatus
};
