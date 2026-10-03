import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { useLocation, Link } from 'react-router-dom';
import { getResumeEnhancement, generateResumeEnhancement, createResumeRevision, saveResumeEnhancement, downloadResumeEnhancement, updateEnhancementReview } from '../../../connector';
import ResumePreview from './ResumePreview';
import './ResumeEnhancement.scss';

export const composeResume = (source, changes) => {
    let result = source;
    changes.filter(x => x.original).map(x => ({ ...x, index: Number.isInteger(x.sourceStart)?x.sourceStart:source.indexOf(x.original) })).sort((a,b) => b.index-a.index).forEach(x => {
        result = result.slice(0,x.index)+x.replacement+result.slice(x.index+x.original.length);
    });
    const summary = changes.find(x => !x.original);
    if (summary) {
        const split = result.search(/\n\s*\n/);
        const position = split < 0 ? result.indexOf('\n') : split;
        result = position < 0 ? `${result}\n\nSUMMARY\n${summary.replacement}` : `${result.slice(0,position)}\n\nSUMMARY\n${summary.replacement}\n${result.slice(position)}`;
    }
    return result;
};
export const AlignmentScore = ({ analysis }) => <div className="enhance-score" aria-label="Resume keyword alignment">
    <strong>{analysis.score === null ? '—' : `${analysis.score}%`}</strong><span>Keyword alignment</span>
    <progress max="100" value={analysis.score || 0}/>
</div>;
export const GapOverview = ({ draft }) => <>
    <div className="enhance-overview"><div><span className="enhance-eyebrow">Tailored to this opportunity</span><h2>{draft.job.title || 'Your application'}</h2><p>{draft.job.company}</p><span className="enhance-source">From: {draft.source_name}</span></div><AlignmentScore analysis={draft.analysis}/></div>
    <p className="enhance-disclaimer">{draft.analysis.explanation} {draft.analysis.limitation}</p>
    <div className="enhance-gap-grid"><section><h3>Already in your resume <small>{draft.analysis.matched.length}</small></h3><div className="enhance-tags">{draft.analysis.matched.map(k => <span className="matched" key={k}>{k}</span>)}{!draft.analysis.matched.length && <p>No recognized job keywords found yet.</p>}</div></section>
        <section><h3>Not found in your resume <small>{draft.analysis.missing.length}</small></h3><div className="enhance-tags">{draft.analysis.missing.map(k => <span key={k}>{k}</span>)}{!draft.analysis.missing.length && <p>No detected keyword gaps.</p>}</div><p>Only add skills you actually have. A missing keyword does not mean you lack the qualification.</p></section></div>
    <section className="enhance-checks"><h3>Text readability checks</h3>{draft.analysis.checks.map(check => <div key={check.key}><span aria-hidden="true">{check.passed ? '✓' : '○'}</span>{check.label}<small>{check.passed ? 'Found' : 'Not detected'}</small></div>)}</section>
</>;
const message = error => error.response?.data?.message || error.message || 'Unable to complete this action. Please try again.';

export default function ResumeEnhancement({ initialDraft, onClose, onSaved }) {
    const [draft, setDraft] = useState(initialDraft);
    const [step,setStep] = useState(['ready','saved'].includes(initialDraft.status) ? 2 : initialDraft.status==='generating'?1:0);
    const [sections,setSections] = useState(initialDraft.options?.sections || ['summary','skills','experience']);
    const [mode,setMode] = useState(initialDraft.options?.mode || 'quick');
    const [evidence,setEvidence] = useState(initialDraft.options?.evidence || '');
    const [keywords,setKeywords] = useState(initialDraft.options?.selectedKeywords || []);
    const [customKeywords,setCustomKeywords] = useState((initialDraft.options?.selectedKeywords || []).filter(k=>!initialDraft.analysis.missing.includes(k)));
    const [keywordInput,setKeywordInput] = useState('');
    const [keywordError,setKeywordError] = useState('');
    const keywordChoices = [...draft.analysis.missing,...customKeywords];
    const toggleKeyword = keyword => {
        setKeywordError('');
        if(keywords.includes(keyword))setKeywords(current=>current.filter(k=>k!==keyword));
        else if(keywords.length<40)setKeywords(current=>[...current,keyword]);
        else setKeywordError('Choose up to 40 keywords.');
    };
    const addKeyword = () => {
        const value=keywordInput.trim().replace(/\s+/g,' ');
        if(!value)return;
        if(value.length>80){setKeywordError('Keep each keyword under 81 characters.');return;}
        const existing=keywordChoices.find(k=>k.toLowerCase()===value.toLowerCase());
        if(!keywords.includes(existing)&&keywords.length>=40){setKeywordError('Choose up to 40 keywords.');return;}
        if(!existing)setCustomKeywords(current=>[...current,value]);
        setKeywords(current=>current.includes(existing||value)?current:[...current,existing||value]);
        setKeywordInput('');setKeywordError('');
    };
    const [consent,setConsent] = useState(false);
    const [busy,setBusy] = useState(initialDraft.status === 'generating');
    const [operation,setOperation] = useState('');
    const [error,setError] = useState('');
    const [notice,setNotice] = useState('');
    const [text,setText] = useState(initialDraft.previewText || initialDraft.source_text);
    const [editorMode,setEditorMode] = useState('preview');
    const [instructions,setInstructions] = useState('');
    const [versions,setVersions] = useState([]);
    const [reviewed,setReviewed] = useState(false);
    const [autosave,setAutosave] = useState('');
    const [name,setName] = useState(`${initialDraft.job.company || 'Job'} — ${initialDraft.job.title || 'Tailored resume'}`.slice(0,199));
    const alive = useRef(true);
    const contentRef = useRef(null);
    const generationReceived = useRef(false);
    const generationInFlight = useRef(false);
    const [recovering,setRecovering] = useState(initialDraft.status === 'generating');
    useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0;},[step,busy]);
    const saveQueue = useRef(Promise.resolve());
    const persistReview = useCallback(value => {
        // Serialize writes so a slower earlier request cannot overwrite a later edit.
        const pending = saveQueue.current.catch(()=>{}).then(()=>updateEnhancementReview(draft.id,value));
        saveQueue.current = pending;
        return pending;
    },[draft.id]);
    useEffect(() => { alive.current=true; return () => { alive.current=false; }; }, []);
    useEffect(()=>{
        if(draft.status!=='ready'||operation)return undefined;
        setAutosave('Saving draft…');
        const timer=window.setTimeout(()=>persistReview(text).then(()=>{if(alive.current)setAutosave('Draft saved');}).catch(()=>{if(alive.current)setAutosave('Draft not saved. Keep this window open or save your resume.');}),800);
        return()=>window.clearTimeout(timer);
    },[draft.status,text,persistReview,operation]);
    const close = async () => {
        if(operation)return;
        if(draft.status==='ready') {
            try {await persistReview(text);} catch {setError('Your latest edits could not be saved. Retry closing or download your reviewed resume before leaving.');return;}
        }
        onClose();
    };
    const receive = next => {
        if(generationReceived.current)return;
        setDraft(next);
        if (['ready','saved'].includes(next.status)) {generationReceived.current=true;setStep(2);setText(next.previewText);setReviewed(false);setEditorMode('preview');setBusy(false);}
        else if(next.status==='failed'){setBusy(false);setError(next.error_message);}
    };
    useEffect(() => {
        if(draft.status!=='generating'||!recovering)return undefined;
        let cancelled=false;let timer;let delay=5000;
        const poll=async()=>{
            try {
                const next=await getResumeEnhancement(draft.id);
                if(cancelled||!alive.current)return;
                receive(next);
                if(next.status!=='generating')return;
                if(Date.now()-new Date(next.updated_at).getTime()>125000){setBusy(false);setError('Generation was interrupted. You can retry.');setDraft({...next,status:'failed'});return;}
                delay=Math.min(delay*2,15000);timer=window.setTimeout(poll,delay);
            }catch(e){if(!cancelled&&alive.current){setBusy(false);setRecovering(false);setError(message(e));}}
        };
        timer=window.setTimeout(poll,delay);
        return()=>{cancelled=true;window.clearTimeout(timer);};
    },[draft.id,draft.status,recovering]);
    const generate = async () => {
        if(busy||generationInFlight.current)return;
        generationInFlight.current=true;setRecovering(false);
        generationReceived.current=false;
        setBusy(true);setError('');setDraft(d=>({...d,status:'generating',updated_at:new Date().toISOString()}));
        try {const next=await generateResumeEnhancement(draft.id,{sections,mode,evidence,selectedKeywords:keywords,consent});if(alive.current){receive(next);setRecovering(next.status==='generating');}}
        catch(e){if(alive.current){if(!e.response){setRecovering(true);}else{setError(message(e));setBusy(false);setDraft(d=>({...d,status:'failed'}));}}}
        finally{generationInFlight.current=false;}
    };
    const exportDraft = async save => {
        if(operation)return;
        setOperation(save?'save':'download');setError('');setNotice('');
        try {
            await saveQueue.current.catch(()=>{});
            const values={text,reviewed,displayName:name};
            if(save){const resume=await saveResumeEnhancement(draft.id,values);setDraft(d=>({...d,status:'saved',saved_resume_id:resume.id}));setNotice('Saved as a separate resume and selected for this job. Your primary resume is unchanged.');onSaved?.(resume);}
            else {const response=await downloadResumeEnhancement(draft.id,values);const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[\\/:*?"<>|]/g,'-')}.docx`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),10000);setNotice('DOCX downloaded. Review the document layout before submitting it.');}
        }catch(e){setError(message(e));}finally{setOperation('');}
    };
    const revise = async (manual=false,regenerate=false) => {
        if(busy||operation||generationInFlight.current||(!manual&&!consent))return;
        if(manual&&draft.status!=='saved'){setEditorMode('editor');return;}
        generationInFlight.current=true;setOperation('revision');setError('');setNotice('');
        const previous={draft,text,name};let child;
        try{
            await saveQueue.current.catch(()=>{});
            if(draft.status==='ready')await persistReview(text);
            child=await createResumeRevision(draft.id,{text,requestId:crypto.randomUUID(),editable:manual});
            if(!alive.current)return;
            setVersions(current=>[...current.slice(-9),previous]);setDraft(child);setReviewed(false);setAutosave('');
            if(manual){setEditorMode('editor');return;}
            generationReceived.current=false;setBusy(true);setRecovering(false);setDraft({...child,status:'generating',updated_at:new Date().toISOString()});
            const next=await generateResumeEnhancement(child.id,{sections,mode,evidence,selectedKeywords:keywords,consent,instructions:regenerate?'Create an alternative, clearer version of the selected sections. Preserve all facts.':instructions.trim()});
            if(alive.current){receive(next);setRecovering(next.status==='generating');setInstructions('');}
        }catch(e){if(alive.current){
            if(child&&!e.response){setRecovering(true);}
            else{setBusy(false);setDraft(previous.draft);setText(previous.text);setError(message(e));}
        }}finally{generationInFlight.current=false;if(alive.current)setOperation('');}
    };
    const restoreVersion=async()=>{
        if(!versions.length||busy||operation)return;
        setOperation('restore');
        try{if(draft.status==='ready')await persistReview(text);const previous=versions[versions.length-1];setDraft(previous.draft);setText(previous.text);setName(previous.name);setVersions(current=>current.slice(0,-1));setReviewed(false);setError('');setNotice('Previous version restored.');}
        catch(e){setError(message(e));}finally{setOperation('');}
    };
    const consentField=<div className={`enhance-required-consent ${consent?'is-confirmed':''}`}><label><input type="checkbox" required aria-required="true" aria-describedby="enhance-consent-help" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span><strong>Permission to use AI <span className="enhance-required">* Required</span></strong><span>Send this resume, the job description and my additional context to OpenAI to generate suggestions. My original resume and Profile will remain unchanged.</span></span></label><small id="enhance-consent-help">{consent?'Permission confirmed.':'Check this box to enable AI generation. Manual editing does not require AI permission.'}</small></div>;
    const saved=draft.status==='saved';
    return <Dialog open fullWidth maxWidth="lg" onClose={close} className="enhancement-dialog" aria-labelledby="enhance-title">
        <DialogTitle id="enhance-title"><span><span className="enhance-title-icon" aria-hidden="true">✦</span> Resume enhancement</span><IconButton aria-label="Close resume enhancement" onClick={close} disabled={!!operation}>×</IconButton></DialogTitle>
        <DialogContent ref={contentRef}><ol className="enhance-steps">{['See the gaps','Choose improvements','Review your resume'].map((label,i)=><li key={label} className={step===i?'active':step>i?'complete':''}><span>{i+1}</span>{label}</li>)}</ol>
            {error&&<div className="enhance-alert error" role="alert">{error}</div>}
            {notice&&<div className="enhance-alert success" role="status">{notice}</div>}
            {busy?<div className="enhance-generating" role="status" aria-live="polite"><div className="enhance-orbit" aria-hidden="true">✦</div><h2>Finding a clearer way to tell your story</h2><p>Aligning your wording with this job, while preserving your facts.</p><div className="enhance-loading-track"/><p>You can close this window and return to the draft from Resumes. Nothing is attached or submitted yet.</p></div>:
            step===0?<GapOverview draft={draft}/>:
            step===1?<div className="enhance-options"><section><span className="enhance-eyebrow">01 / Focus your edit</span><h2>What would you like to improve?</h2><p>We suggest targeted changes, keeping everything else intact.</p>{[['summary','Professional summary','Highlight your relevant experience without inventing qualifications.'],['skills','Skills','Organize skills you have around the role’s needs.'],['experience','Work experience','Make relevant achievements clearer and more concise.']].map(([key,label,help])=><label className="enhance-option" key={key}><input type="checkbox" checked={sections.includes(key)} onChange={()=>setSections(current=>current.includes(key)?current.filter(x=>x!==key):[...current,key])}/><span><strong>{label}</strong><small>{help}</small></span></label>)}
                {sections.includes('experience')&&<fieldset><legend>Experience coverage</legend><label><input type="radio" name="enhancement-mode" checked={mode==='quick'} onChange={()=>setMode('quick')}/> Quick · first two roles</label><label><input type="radio" name="enhancement-mode" checked={mode==='full'} onChange={()=>setMode('full')}/> Full · all roles</label></fieldset>}</section>
                <section><span className="enhance-eyebrow">02 / Keyword focus</span><h2>Choose relevant keywords</h2><p>Select missing skills to focus on, or add your own. Choose only skills supported by your resume or the factual context below.</p>
                    <div className="enhance-keyword-heading"><strong>{keywords.length} selected</strong><button type="button" className="enhance-secondary" onClick={()=>{setKeywords(keywords.length?[]:keywordChoices.slice(0,40));setKeywordError('');}}>{keywords.length?'Deselect all':'Select all'}</button></div>
                    <div className="enhance-keyword-chips" role="group" aria-label="Keywords to focus on">{keywordChoices.map(k=><button type="button" key={k} aria-pressed={keywords.includes(k)} onClick={()=>toggleKeyword(k)}><span aria-hidden="true">{keywords.includes(k)?'✓':'+'}</span>{k}</button>)}</div>
                    <label className="enhance-keyword-label" htmlFor="custom-enhancement-keyword">Add a custom keyword</label><div className="enhance-keyword-input"><input id="custom-enhancement-keyword" value={keywordInput} maxLength={80} placeholder="e.g. GraphQL" onChange={e=>setKeywordInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();addKeyword();}}}/><button type="button" className="enhance-secondary" disabled={!keywordInput.trim()} onClick={addKeyword}>Add keyword</button></div>
                    {keywordError&&<p role="alert">{keywordError}</p>}<p className="enhance-disclaimer">Up to 40 keywords, 80 characters each. Selecting a keyword does not establish experience or change your match score.</p>
                    <label className="enhance-context">Additional facts from your experience<textarea maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Example: Used GitHub Actions to run the test suite for my personal portfolio project."/><small>{evidence.length}/2,000</small></label><p>Job requirements alone are never evidence. Review every generated claim before using it.</p></section>
                {consentField}<p className="enhance-disclaimer">Up to 5 enhancement attempts per UTC day. Failed attempts also count toward this limit. Enhancement does not guarantee an ATS pass.</p></div>:
            <div className="enhance-review-workspace"><aside className="enhance-rewrite-sidebar"><span className="enhance-eyebrow">Your writing studio</span><h2>Make it sound like you</h2><p>Polish the wording with AI or edit the resume yourself.</p>
                <section className="enhance-change-summary"><h3>What’s updated</h3><p>{draft.changes.length} targeted edits in this version.</p><ul>{draft.changes.map((change,i)=><li key={i}>{change.reason}</li>)}</ul>{!draft.changes.length&&<p>Your current wording is preserved. You can make changes below.</p>}</section>
                <label className="enhance-rewrite-label">How should AI edit your resume?<textarea value={instructions} maxLength={1000} onChange={e=>setInstructions(e.target.value)} placeholder="e.g. Shorten my summary and make my latest experience more concise."/></label>
                <div className="enhance-quick-prompts">{['Shorten my summary','Use stronger action verbs','Make my experience more concise'].map(prompt=><button type="button" key={prompt} onClick={()=>setInstructions(prompt)}>{prompt} ↗</button>)}</div>
                {consentField}<div className="enhance-rewrite-actions"><button className="enhance-primary" disabled={!consent||!instructions.trim()||!!operation||draft.generationAvailable===false} onClick={()=>revise()}>✦ Edit with AI</button><button className="enhance-secondary" disabled={!consent||!!operation||draft.generationAvailable===false} onClick={()=>revise(false,true)}>↻ Regenerate</button></div>
                <p className="enhance-disclaimer">Each AI edit or regeneration uses one of your 5 daily attempts. Manual edits are free. AI suggestions still need your review.</p>
                {versions.length>0&&<button className="enhance-secondary" disabled={!!operation} onClick={restoreVersion}>Restore previous version</button>}
                {draft.usage?.totalTokens>0&&<p className="enhance-token-usage">AI usage: {draft.usage.totalTokens.toLocaleString()} tokens</p>}</aside>
                <section className="enhance-document-workspace"><div className="enhance-document-toolbar"><label>Resume name<input maxLength={199} value={name} onChange={e=>setName(e.target.value)} disabled={saved||!!operation}/></label><div role="group" aria-label="Resume editing mode"><button className="enhance-secondary" aria-pressed={editorMode==='preview'} onClick={()=>setEditorMode('preview')}>Preview</button><button className="enhance-secondary" aria-pressed={editorMode==='editor'} disabled={!!operation} onClick={()=>revise(true)}>Edit manually</button></div></div>
                {editorMode==='editor'?<label className="enhance-editor-label">Final resume · editable<textarea className="enhance-editor" value={text} maxLength={30000} readOnly={saved||!!operation} onChange={e=>{setText(e.target.value);setReviewed(false);}} spellCheck/></label>:<div className="enhance-paper-stage"><ResumePreview text={text} changes={draft.changes}/></div>}
                <div className="enhance-document-status"><span>Single-column layout · DOCX export</span>{autosave&&<small role="status">{autosave}</small>}</div><label className="enhance-consent"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed all qualifications, dates, names and achievements and confirm this resume accurately represents me.</span></label></section></div>}
        </DialogContent>
        <footer className="enhance-footer"><button type="button" className="enhance-secondary" onClick={close} disabled={!!operation}>{busy?'Close and return later':saved?'Done':'Keep original for now'}</button><div>
            {!busy&&step===1&&<button className="enhance-secondary" onClick={()=>setStep(0)}>Back</button>}
            {!busy&&step===0&&<button className="enhance-primary" onClick={()=>setStep(1)}>Choose improvements →</button>}
            {!busy&&step===1&&<button className="enhance-primary" disabled={!consent||!sections.length||draft.generationAvailable===false} onClick={generate}>{draft.generationAvailable===false?'AI is not configured':'Generate suggestions'}</button>}
            {!busy&&step===2&&<><button className="enhance-secondary" disabled={!reviewed||!!operation} onClick={()=>exportDraft(false)}>{operation==='download'?'Preparing…':'Download DOCX'}</button><button className="enhance-primary" disabled={!reviewed||!name.trim()||text.trim().length<80||!!operation||saved} onClick={()=>exportDraft(true)}>{saved?'Selected for this job':operation==='save'?'Saving…':'Save & use for this job'}</button></>}
        </div></footer>
    </Dialog>;
}

export function ResumeEnhancementPage(){
    const location=useLocation();const id=new URLSearchParams(location.search).get('id');const [draft,setDraft]=useState(null);const [error,setError]=useState('');const [open,setOpen]=useState(true);
    useEffect(()=>{let active=true;getResumeEnhancement(id).then(d=>{if(active)setDraft(d);}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[id]);
    return <main className="enhancement-page"><h1>Resume enhancement</h1><p>Review your tailored version, then return to the application and click Autofill. JobPilot will use the saved version for this job.</p>{error&&<p role="alert">{error}</p>}{!draft&&!error&&<p role="status">Opening your resume workspace…</p>}{draft&&<button className="enhance-primary" onClick={()=>setOpen(true)}>Open resume workspace</button>} <Link to="/resumes">Your resumes</Link>{draft&&open&&<ResumeEnhancement key={draft.id} initialDraft={draft} onClose={()=>{setOpen(false);getResumeEnhancement(id).then(setDraft).catch(()=>{});}}/>}</main>;
}
