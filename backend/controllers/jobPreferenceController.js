const repo = require("../repositories/jobPreferenceRepository");
const { enrichJobPreferencesFromCache } = require("../services/jobPostingService");

const list = async (req,res,next) => { try {
    const preferences = await repo.listPreferences(req.auth.userId, req.query.state);
    res.json({ jobs: await enrichJobPreferencesFromCache(preferences) });
} catch(e){ next(e); } };
const create = async (req,res,next) => { try { if(!req.body.jobUrl) return res.status(400).json({message:"Job URL is required"}); res.status(201).json({ job: await repo.setPreference(req.auth.userId, req.body) }); } catch(e){ next(e); } };
const remove = async (req,res,next) => { try { const ok=await repo.removePreference(req.auth.userId,req.params.id); if(!ok)return res.status(404).json({message:"Saved job not found"}); res.status(204).send(); } catch(e){ next(e); } };
module.exports = { create, list, remove };
