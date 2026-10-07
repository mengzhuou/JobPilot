import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@mui/material';
import { Link } from 'react-router-dom';
import { assessResumeForJob, dismissResumeEnhancement, setEnhancementReminders, clearJobResumeSelection, getResumeEnhancements } from '../../../connector';
import ResumeEnhancement, { AlignmentScore } from './ResumeEnhancement';

export default function ResumeEnhancementEntry({job,onContinue}) {
    const [result,setResult]=useState(null);
    const [checking,setChecking]=useState(Boolean(job.jobUrl||job.url));
    const [error,setError]=useState('');const [prompt,setPrompt]=useState(false);const [editing,setEditing]=useState(false);const [disabled,setDisabled]=useState(false);const [selectedName,setSelectedName]=useState('');
    const dismissedJobs=useRef(new Set());
    const [revision,setRevision]=useState(0);
    const serializedJob=JSON.stringify({url:job.jobUrl||job.url,title:job.jobTitle||job.title,company:job.company,description:job.description,summary:job.summary,requirements:job.requirements,tags:job.tags});
    useEffect(()=>{
        const context=JSON.parse(serializedJob);if(!context.url)return undefined;
        let active=true;setError('');setPrompt(false);setResult(null);setSelectedName('');
        setChecking(!dismissedJobs.current.has(context.url));
        assessResumeForJob({job:context}).then(next=>{if(active){setResult(next);setPrompt(next.available===true&&next.shouldPrompt===true&&!dismissedJobs.current.has(context.url));setSelectedName(next.selectedResumeName||'');}})
            .catch(()=>{/* An optional assessment must never interrupt Autofill. */})
            .finally(()=>{if(active)setChecking(false);});
        return()=>{active=false;};
    },[serializedJob,revision]);
    const dismiss=async()=>{
        setError('');
        dismissedJobs.current.add(JSON.parse(serializedJob).url);
        setChecking(false);setPrompt(false);
        try {if(disabled)await setEnhancementReminders(true);if(result?.draft)await dismissResumeEnhancement(result.draft.id);}
        catch(e){setError('Could not save your reminder preference. You can still close this prompt.');}
    };
    const continueOriginal=()=>{void dismiss();onContinue?.();};
    const usePrimary=async()=>{
        try{await clearJobResumeSelection(JSON.parse(serializedJob));setSelectedName('');setResult(null);setRevision(r=>r+1);}
        catch(e){setError('Could not change the selection. Please retry.');}
    };
    return <>
        {selectedName&&<section className="enhance-selected-resume" aria-label="Selected resume"><span>Selected for this job: <strong>{selectedName}</strong></span><button type="button" className="enhance-secondary" onClick={usePrimary}>Use primary resume instead</button>{error&&<p role="alert">{error}</p>}</section>}
        {(checking||prompt)&&!editing&&<Dialog open onClose={()=>{void dismiss();}} maxWidth="sm" fullWidth className="enhance-prompt" aria-labelledby="enhance-prompt-title"><div className="enhance-prompt-content">
            <div className="enhance-prompt-heading"><span className="enhance-eyebrow">Before you autofill</span><button type="button" className="enhance-prompt-close" aria-label="Close improvement suggestion" onClick={()=>{setPrompt(false);dismiss();}}>×</button></div>
            <h2 id="enhance-prompt-title">{checking?'Your resume for this role':'Improve your resume for this role'}</h2>
            {checking?<p role="status" aria-live="polite">Checking your resume’s alignment… You can continue applying at any time.</p>:<p className="enhance-low-match">Your resume’s keyword match is low. Highlight your relevant experience with a tailored version before continuing.</p>}
            {result?.draft&&<><div className="enhance-overview"><div><h2>{result.draft.job.title}</h2><p>{result.draft.job.company}</p></div><AlignmentScore analysis={result.draft.analysis}/></div><h3>{result.draft.analysis.missing.length} job keywords not found</h3><div className="enhance-tags">{result.draft.analysis.missing.slice(0,12).map(k=><span key={k}>{k}</span>)}</div></>}
            <p className="enhance-disclaimer">This is a keyword estimate, not an ATS verdict. We’ll only use your real experience; your original stays unchanged.</p>
            {error&&<p role="alert">{error}</p>}{!checking&&<label className="enhance-consent"><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/> Don’t remind me again</label>}
            <div className="prompt-actions"><button className="enhance-primary" disabled={checking||!result?.draft} onClick={()=>{void dismiss();setEditing(true);}}>Tailor my resume</button><button className="enhance-secondary" onClick={continueOriginal}>{checking?'Continue applying':'Continue without enhancing'}</button></div>
        </div></Dialog>}
        {editing&&result?.draft&&<ResumeEnhancement initialDraft={result.draft} onSaved={resume=>setSelectedName(resume.display_name)} onClose={()=>{setEditing(false);setPrompt(false);assessResumeForJob({job:JSON.parse(serializedJob)}).then(next=>{setResult(next);setSelectedName(next.selectedResumeName||'');}).catch(()=>{});}}/>}
    </>;
}

export function EnhancementHistory(){
    const [data,setData]=useState(null);const [error,setError]=useState('');
    useEffect(()=>{let active=true;getResumeEnhancements().then(value=>{if(active)setData(value);}).catch(()=>{});return()=>{active=false;};},[]);
    if(!data)return null;
    return <section className="resume-enhancement-entry"><div className="entry-heading"><h3>Job-tailored resumes</h3><label><input type="checkbox" checked={!data.preferences.reminders_disabled} onChange={async e=>{const enabled=e.target.checked;try{await setEnhancementReminders(!enabled);setData(d=>({...d,preferences:{reminders_disabled:!enabled}}));}catch{setError('Unable to save reminder preference.');}}}/> Offer enhancement before Autofill</label></div>
        <p>Enhance from a job’s Autofill page. Your originals are preserved. Return here to finish reviewing a draft.</p>{error&&<p role="alert">{error}</p>}
        {data.drafts.length>0&&<details><summary>Recent drafts ({data.drafts.length})</summary>{data.drafts.map(d=><p key={d.id}><Link to={`/resume-enhancement?id=${d.id}`}>{d.job.title||'Application'}{d.job.company?` · ${d.job.company}`:''}</Link> — {d.status==='generating'?'Generating':d.status==='saved'?'Saved':d.status==='ready'?'Ready for review':d.status==='failed'?'Retry available':'Assessed'}</p>)}</details>}
    </section>;
}
