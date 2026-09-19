// applicationController.js

const asyncHandler = require("express-async-handler");
const {
    startApplicationAgent,
    stopApplicationAgent,
    isApplicationAgentRunning
} = require("../services/applicationAgent");
const resumeRepository = require("../repositories/resumeRepository");
const userProfileRepository = require("../repositories/userProfileRepository");
const reviewRepository = require("../repositories/aiAutofillReviewRepository");

const startApplication = asyncHandler(async (req, res, next) => {
    try {
        const { jobUrl, jobTitle, company, location, summary, requirements, aiAmbiguityMode, useAi = false } = req.body;

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

        const candidateProfile = await userProfileRepository.getByUserId(req.auth.userId);
        let review = null;
        let plannedAnswers = [];
        let reviewEvents = [];
        const job = {
            url: jobUrl,
            title: jobTitle,
            company,
            location,
            summary,
            requirements: Array.isArray(requirements) ? requirements : [],
        };
        const ambiguityMode = aiAmbiguityMode === "ask_user" ? "ask_user" : "auto_review";
        if (useAi) review = await reviewRepository.create(req.auth.userId, {
            jobUrl, jobTitle, company, ambiguityMode, answers: [], unresolvedFields: [],
        });
        const saveReview = async () => {
            if (!review) return;
            review = await reviewRepository.update(req.auth.userId, review.id, {
                answers: plannedAnswers,
                unresolvedFields: reviewEvents,
            }) || review;
        };

        await startApplicationAgent(jobUrl, {
            resume: primaryResume,
            aiContext: useAi ? { job, profile: candidateProfile, ambiguityMode } : null,
            onAiPlan: async plan => {
                plannedAnswers = plan;
                await saveReview();
            },
            onAiPlanChanged: async plan => {
                plannedAnswers = plan;
                await saveReview();
            },
            onAutofillEvent: async event => {
                if (event.type === "field_not_filled") reviewEvents = [...reviewEvents, event.field];
                if (event.type === "ai_error") reviewEvents = [...reviewEvents, { question: "AI answer plan", type: "system", source: event.message }];
                await saveReview();
            },
        });

        res.status(200).json({
            message: "Application agent started",
            reviewId: review?.id || null,
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
