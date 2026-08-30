const repo=require("../repositories/feedbackRepository");
const create=async(req,res,next)=>{try{if(!req.body.subject?.trim()||!req.body.message?.trim())return res.status(400).json({message:"Subject and feedback are required"});res.status(201).json({feedback:await repo.createFeedback(req.auth.userId,req.body)});}catch(e){next(e);}};
const list=async(req,res,next)=>{try{res.json({feedback:await repo.listFeedback()});}catch(e){next(e);}};
const update=async(req,res,next)=>{try{if(!['unread','read','resolved'].includes(req.body.status))return res.status(400).json({message:'Invalid feedback status'});const feedback=await repo.updateFeedback(req.params.id,req.body);if(!feedback)return res.status(404).json({message:'Feedback not found'});res.json({feedback});}catch(e){next(e);}};
module.exports={create,list,update};
