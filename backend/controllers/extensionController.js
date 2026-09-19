const asyncHandler = require("express-async-handler");
const connectionRepository = require("../repositories/extensionConnectionRepository");
const profileRepository = require("../repositories/userProfileRepository");
const resumeRepository = require("../repositories/resumeRepository");
const reviewRepository = require("../repositories/aiAutofillReviewRepository");
const { mapProfileForAutofill } = require("../services/autofillProfileMapper");
const { createDeterministicFillPlan, safeField } = require("../services/extensionAutofillPlanner");
const { createApplicationAnswerPlan } = require("../services/applicationAiService");

const pairingCode = asyncHandler(async (req, res) => {
    const pairing = await connectionRepository.createPairingCode(req.auth.userId);
    res.status(201).json({ pairing });
});

const exchange = asyncHandler(async (req, res) => {
    const code = String(req.body?.code || "");
    const deviceName = String(req.body?.deviceName || "Chrome extension").trim();
    if (!code || deviceName.length > 100) return res.status(400).json({ message: "A valid pairing code is required." });
    const connection = await connectionRepository.exchangePairingCode(code, deviceName || "Chrome extension");
    if (!connection) return res.status(400).json({ message: "That pairing code is invalid, expired, or already used." });
    res.status(201).json({
        token: connection.token,
        expiresAt: connection.expiresAt,
    });
});

const listConnections = asyncHandler(async (req, res) => {
    res.json({ connections: await connectionRepository.listConnections(req.auth.userId) });
});

const revokeConnection = asyncHandler(async (req, res) => {
    const revoked = await connectionRepository.revokeConnection(req.auth.userId, req.params.id);
    if (!revoked) return res.status(404).json({ message: "Extension connection was not found." });
    res.status(204).send();
});

const disconnect = asyncHandler(async (req, res) => {
    await connectionRepository.revokeCurrentToken(req.auth.extensionTokenId);
    res.status(204).send();
});

const getMappedProfile = asyncHandler(async (req, res) => {
    const editableProfile = await profileRepository.getByUserId(req.auth.userId);
    if (!editableProfile) return res.status(404).json({ message: "Complete your JobPilot Profile before using Autofill." });
    const mapped = mapProfileForAutofill(editableProfile);
    res.json({ profile: mapped.profile, missingProfileFields: mapped.missing });
});

const fillPlan = asyncHandler(async (req, res) => {
    const editableProfile = await profileRepository.getByUserId(req.auth.userId);
    if (!editableProfile) return res.status(400).json({ message: "Complete your JobPilot Profile before using Autofill." });
    const mapped = mapProfileForAutofill(editableProfile);
    const plan = createDeterministicFillPlan({ fields: req.body?.fields, profile: mapped.profile });
    res.json({ ...plan, missingProfileFields: mapped.missing });
});

const aiPlan = asyncHandler(async (req, res) => {
    const fields = (Array.isArray(req.body?.fields) ? req.body.fields : [])
        .slice(0, 80)
        .map(safeField)
        .filter(field => field.fieldKey && !field.filled);
    if (!fields.length) return res.status(400).json({ message: "There are no unresolved fields to send to AI." });

    const editableProfile = await profileRepository.getByUserId(req.auth.userId);
    if (!editableProfile) return res.status(400).json({ message: "Complete your JobPilot Profile before using AI." });
    const resume = await resumeRepository.findPrimaryFile(req.auth.userId);
    const job = {
        url: String(req.body?.job?.url || "").slice(0, 2000),
        title: String(req.body?.job?.title || "").slice(0, 300),
        company: String(req.body?.job?.company || "").slice(0, 300),
        summary: String(req.body?.job?.summary || "").slice(0, 6000),
        requirements: Array.isArray(req.body?.job?.requirements) ? req.body.job.requirements.slice(0, 30) : [],
    };
    if (!/^https?:\/\//i.test(job.url)) return res.status(400).json({ message: "A valid application URL is required." });

    const answers = await createApplicationAnswerPlan({
        job,
        profile: editableProfile,
        resume,
        fields: fields.map(field => ({ ...field, locatorKey: field.fieldKey, question: field.label })),
        ambiguityMode: "ask_user",
    });
    const unresolvedFields = fields.filter(field => !answers.some(answer => answer.fieldKey === field.fieldKey && answer.action === "fill"));
    const review = await reviewRepository.create(req.auth.userId, {
        jobUrl: job.url,
        jobTitle: job.title,
        company: job.company,
        ambiguityMode: "ask_user",
        answers,
        unresolvedFields,
    });
    res.json({ answers, reviewId: review.id });
});

module.exports = {
    pairingCode,
    exchange,
    listConnections,
    revokeConnection,
    disconnect,
    getMappedProfile,
    fillPlan,
    aiPlan,
};

