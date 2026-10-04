const asyncHandler=require('express-async-handler');
const {randomUUID}=require('node:crypto');
const repository=require('../repositories/resumeEnhancementRepository');
const resumes=require('../repositories/resumeRepository');
const {extractResumeText}=require('../services/resumeTextService');
const service=require('../services/resumeEnhancementService');
const {enrichJobSkills}=require('../services/semanticJobSkills');
const {createResumeDocument}=require('../services/resumeDocumentService');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const owned=async req=>{
    if(!uuid(req.params.id))throw service.fail('Enhancement not found.',404);
    const draft=await repository.get(req.auth.userId,req.params.id);
    if(!draft)throw service.fail('Enhancement not found.',404);
    return draft;
};
const publicDraft= draft=>({...draft,generation_id:undefined,user_id:undefined,fingerprint:undefined,job_key:undefined,
    generationAvailable:Boolean(process.env.OPENAI_API_KEY),
    previewText:draft.reviewed_text||service.applyChanges(draft.source_text,draft.changes)});
const assess=asyncHandler(async(req,res)=>{
    let job=service.normalizeJob(req.body?.job);
    if(req.body?.resumeId&&!uuid(req.body.resumeId))throw service.fail('Choose a valid resume.');
    const selected=await repository.selectResume(req.auth.userId,job.url);
    const resume=req.body?.resumeId?await resumes.findFile(req.auth.userId,req.body.resumeId):selected||await resumes.findPrimaryFile(req.auth.userId);
    if(!resume)return res.json({available:false,reason:'Upload a resume in Resumes to check its alignment with this job.'});
    let text=resume.extracted_text;
    if(!text){try{text=await extractResumeText({fileData:resume.file_data,mimeType:resume.mime_type});}catch{return res.json({available:false,reason:'This resume cannot be read. Use a text-based PDF or DOCX for enhancement.'});}}
    if(!text||text.trim().length<80)return res.json({available:false,reason:'Not enough readable resume text. Upload a text-based PDF or DOCX.'});
    if(text.length>=30000)return res.json({available:false,reason:'This resume is too long to enhance safely without omitting content. Choose a shorter version; you can still Autofill with the original.'});
    job=await enrichJobSkills(job);
    const analysis=service.assessResume(text,job);
    const draft=await repository.create(req.auth.userId,{sourceId:resume.id,sourceName:resume.display_name||resume.file_name,sourceText:text,job,analysis,
        fingerprint:service.digest(JSON.stringify({text,job,sourceId:resume.id}))});
    const prefs=await repository.preferences(req.auth.userId);
    res.json({available:true,draft:publicDraft(draft),selectedResumeName:selected?.display_name||null,
        shouldPrompt:analysis.shouldEnhance&&!prefs.reminders_disabled&&!draft.dismissed&&!selected&&draft.status!=='saved'});
});
const get=asyncHandler(async(req,res)=>res.json({draft:publicDraft(await owned(req))}));
const revision=asyncHandler(async(req,res)=>{
    const parent=await owned(req);
    if(!['ready','saved'].includes(parent.status))throw service.fail('Finish generating this draft before creating a new version.',409);
    const {text,requestId,editable}=req.body||{};
    if(!uuid(requestId))throw service.fail('A valid revision request ID is required.');
    if(typeof text!=='string'||text.trim().length<80||text.length>30000)throw service.fail('Resume text must be between 80 and 30,000 characters.');
    const child=await repository.create(req.auth.userId,{sourceId:parent.source_resume_id,sourceName:parent.source_name,sourceText:text,job:parent.job,
        analysis:service.assessResume(text,parent.job),fingerprint:service.digest(JSON.stringify({parent:parent.id,requestId,text,editable:editable===true}))});
    if(editable===true)await repository.makeEditable(req.auth.userId,child.id,text);
    res.json({draft:publicDraft(await repository.get(req.auth.userId,child.id))});
});
const updateReview=asyncHandler(async(req,res)=>{
    const draft=await owned(req);
    if(draft.status!=='ready')throw service.fail('Only an unsaved review draft can be edited.',409);
    if(typeof req.body?.text!=='string'||req.body.text.length>40000)throw service.fail('Draft text must be no more than 40,000 characters.');
    await repository.updateReview(req.auth.userId,draft.id,req.body.text);res.sendStatus(204);
});
const list=asyncHandler(async(req,res)=>res.json({drafts:await repository.list(req.auth.userId),preferences:await repository.preferences(req.auth.userId)}));
const preferences=asyncHandler(async(req,res)=>{
    if(typeof req.body?.disabled!=='boolean')throw service.fail('Provide a reminder preference.');
    await repository.setPreferences(req.auth.userId,req.body.disabled);res.sendStatus(204);
});
const dismiss=asyncHandler(async(req,res)=>{await owned(req);await repository.dismiss(req.auth.userId,req.params.id);res.sendStatus(204);});
const generate=asyncHandler(async(req,res)=>{
    const initial=await owned(req);
    if(['ready','saved'].includes(initial.status))return res.json({draft:publicDraft(initial)});
    const options=service.validateOptions(req.body);
    if(!process.env.OPENAI_API_KEY)throw service.fail('AI enhancement is not configured. You can still use your original resume.',503);
    if([initial.job.summary,...initial.job.requirements].join(' ').length<100)throw service.fail('Add a fuller job description before generating.');
    const token=randomUUID();
    const draft=await repository.startGeneration(req.auth.userId,req.params.id,options,token);
    if(!draft)return res.json({draft:publicDraft(await owned(req))});
    try{const result=await service.generateChanges(draft,options);await repository.finishGeneration(req.auth.userId,req.params.id,token,result);}
    catch(error){await repository.finishGeneration(req.auth.userId,req.params.id,token,{usage:error.usage,error:error.statusCode?error.message:'Enhancement timed out or was interrupted. Retry or continue with your original resume.'});throw error.statusCode?error:service.fail('Enhancement was interrupted. Your draft and original resume are safe.',502);}
    res.json({draft:publicDraft(await owned(req))});
});
const reviewedText=(req,draft)=>{
    if(!['ready','saved'].includes(draft.status))throw service.fail('Generate a draft before exporting.',409);
    const text=draft.status==='saved'?draft.reviewed_text:req.body?.text;
    if(typeof text!=='string'||text.trim().length<80||text.length>40000)throw service.fail('Reviewed resume text must be between 80 and 40,000 characters.');
    if(req.body?.reviewed!==true)throw service.fail('Confirm you reviewed the resume for accuracy.');
    return text.trim();
};
const download=asyncHandler(async(req,res)=>{
    const draft=await owned(req);const text=reviewedText(req,draft);const file=await createResumeDocument(text);
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.setHeader('Content-Disposition','attachment; filename="JobPilot-tailored-resume.docx"');res.send(file);
});
const save=asyncHandler(async(req,res)=>{
    const draft=await owned(req);const text=reviewedText(req,draft);const displayName=typeof req.body?.displayName==='string'?req.body.displayName.trim():'';
    if(!displayName||displayName.length>199)throw service.fail('Name this resume (up to 199 characters).');
    const file=await createResumeDocument(text);const resume=await repository.save(req.auth.userId,req.params.id,{text,displayName,file});res.json({resume});
});
const clearSelection=asyncHandler(async(req,res)=>{const job=service.normalizeJob(req.body?.job);await repository.clearSelection(req.auth.userId,job.url);res.sendStatus(204);});
module.exports={assess,get,list,preferences,dismiss,generate,download,save,clearSelection,updateReview,revision};
