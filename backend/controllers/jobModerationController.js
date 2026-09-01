const repo = require("../repositories/jobModerationRepository");
const REPORT_REASONS = new Set([
    "website has bot protection that blocks submission",
    "website is invalid or job no longer exists",
    "It's a scam",
    "Other",
]);
const MAX_INPUT_LENGTH = 199;

const report = async (req,res,next) => { try {
    if (!req.body.jobUrl) return res.status(400).json({message:"Job URL is required"});
    if (!REPORT_REASONS.has(req.body.reason)) return res.status(400).json({message:"Select a valid report reason"});
    const detail = typeof req.body.reasonDetail === "string" ? req.body.reasonDetail.trim() : "";
    if (req.body.reason === "Other" && !detail) return res.status(400).json({message:"Describe the problem"});
    if (detail.length > MAX_INPUT_LENGTH) return res.status(400).json({message:"Report details must be fewer than 200 characters"});
    res.status(201).json({ report: await repo.reportJob(req.auth.userId,req.body) });
} catch(e){ next(e); } };
const list = async (req,res,next) => { try { res.json({ jobs:await repo.listModeration() }); } catch(e){ next(e); } };
const reportStatus = async (req,res,next) => { try {
    if (!req.query.jobUrl) return res.status(400).json({message:"Job URL is required"});
    res.json({ reported:await repo.hasUserReportedJob(req.auth.userId,req.query.jobUrl) });
} catch(e){ next(e); } };
const update = async (req,res,next) => { try {
    if (!req.body.jobUrl) return res.status(400).json({message:"Job URL is required"});
    res.json({ job:await repo.updateModeration(req.auth.userId,req.body) });
} catch(e){ next(e); } };
module.exports={report,reportStatus,list,update};
