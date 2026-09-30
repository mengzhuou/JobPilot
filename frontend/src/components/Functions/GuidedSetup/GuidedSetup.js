import React,{useEffect,useState} from 'react';
import {useSelector} from 'react-redux';
import {useNavigate} from 'react-router-dom';
import Dialog from '@mui/material/Dialog';
import {getSignedInUser,getUserProfile,getResumes,saveOnboarding} from '../../../connector';
import {profileStrength} from '../../Pages/Profile/profileCompleteness';
import './GuidedSetup.scss';

export const steps=[
    {title:'Let’s set up your application profile',text:'We’ll guide you through your profile and show you how JobPilot works. You can leave any step unfinished. Next Step does not save form changes; use the editor’s Save button. Skip dismisses this guide permanently.'},
    {title:'Start with your resume',text:'Upload a PDF or DOCX and select “Parse this resume” to fill missing profile information. Review the parsed results and choose your primary resume. You can also enter everything manually.',path:'/resumes',state:{uploadAndParse:true},action:'Open resume upload'},
    {title:'Check your contact information',text:'Review your name, email, phone, location, and professional links. Autofill uses these saved facts on application forms.',section:'personal',action:'Edit personal information'},
    {title:'Add your education',text:'Add your school, degree, field of study, and accurate start/end dates. Include GPA only if you want to share it.',section:'education',action:'Edit education'},
    {title:'Add your work experience',text:'Add employers, roles, dates, and accomplishments. Save only accurate details; AI should never invent your experience.',section:'experience',action:'Edit work experience'},
    {title:'Choose your skills',text:'Select skills you have or type your own. These help match jobs and answer application questions.',section:'skills',action:'Edit skills'},
    {title:'Set your job preferences',text:'Choose target roles, locations, and office preferences. Complete saved application answers where relevant.',section:'preferences',action:'Edit preferences'},
    {title:'Optional employment information',text:'Review work eligibility and demographic questions only if you want to save those answers. These fields are optional and do not affect profile strength.',section:'equalEmployment',action:'Review optional answers'},
    {title:'Connect browser autofill',text:'Load the JobPilot extension, then use Connect extension in Profile. On a supported application, review detected answers and choose Fill. Review and submit on the employer’s page.',path:'/profile#extension',action:'Open extension setup'},
    {title:'Find and save jobs',text:'Use Active Job Postings to filter roles, review match information, and save opportunities you want to pursue.',path:'/active-job-postings',action:'Explore jobs'},
    {title:'Meet AI Loop',text:'AI Loop is being built for assisted application preparation and review. Explore its current setup page; the guide does not start a Loop or submit applications. You can keep editing your profile at any time.',path:'/loops',action:'Explore AI Loop'},
];
export default function GuidedSetup(){
    const authenticated=useSelector(state=>state.auth.isAuthenticated);
    const account=useSelector(state=>state.studentData?.email);
    const navigate=useNavigate();
    const [guide,setGuide]=useState(null),[expanded,setExpanded]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
    useEffect(()=>{
        let active=true;setGuide(null);
        if(!authenticated)return ()=>{active=false;};
        (async()=>{
            const user=await getSignedInUser();
            if(!active || !user?.id || ['completed','skipped'].includes(user.onboarding?.status))return;
            if(user.onboarding?.status==='active'){setGuide(user.onboarding);setExpanded(true);return;}
            if(user.onboarding?.status!=='pending'){
                const [profile,resumes]=await Promise.all([getUserProfile().catch(err=>{if(err.response?.status===404)return {};throw err;}),getResumes()]);
                if(profileStrength(profile,resumes.some(row=>row.is_primary)).score!==0)return;
            }
            if(!active)return;
            const saved=await saveOnboarding({status:'active',step:0});
            if(active && saved.status==='active'){setGuide(saved);setExpanded(true);}
        })().catch(()=>{}); // Failed eligibility checks must not misclassify a profile as empty.
        return ()=>{active=false;};
    },[authenticated,account]);
    if(!authenticated || !guide || guide.status!=='active')return null;
    const index=Math.min(Math.max(guide.step,0),steps.length-1),step=steps[index];
    const advance=async status=>{
        if(busy)return;
        setBusy(true);setError('');
        try {
            const saved=await saveOnboarding({status,step:status==='active'?index+1:index});
            setGuide(saved);setExpanded(true);
        } catch {setError('Could not save your progress. Please try again.');}
        finally{setBusy(false);}
    };
    const openStep=()=>{
        setExpanded(false);
        navigate(step.section?'/profile':step.path,{state:step.section?{guidedSection:step.section}:step.state});
    };
    return <>
        <Dialog open={expanded} onClose={()=>{if(!busy)setExpanded(false);}} maxWidth="sm" fullWidth aria-labelledby="guided-setup-title">
            <div className="guided-setup">
                <span className="guided-setup-eyebrow">YOUR JOBPILOT QUICK START · {index+1} / {steps.length}</span>
                <progress value={index+1} max={steps.length} aria-label="Walkthrough progress"/>
                <h2 id="guided-setup-title">{step.title}</h2><p>{step.text}</p>
                {step.action && <button className="guided-setup-open" onClick={openStep} disabled={busy}>{step.action} <span aria-hidden="true">↗</span></button>}
                {error && <p role="alert">{error}</p>}
                <div className="guided-setup-actions"><button disabled={busy} onClick={()=>advance('skipped')}>Skip</button><button disabled={busy} onClick={()=>advance(index===steps.length-1?'completed':'active')}>{busy?'Saving…':index===steps.length-1?'Finish':'Next Step'}</button></div>
                <small>Your progress is saved to your account. Skipping or finishing stops future automatic prompts.</small>
            </div>
        </Dialog>
        {!expanded && <aside className="guided-setup-dock" aria-label="Profile setup guide"><button onClick={()=>setExpanded(true)}>Continue guide · {index+1}/{steps.length} <span aria-hidden="true">→</span></button></aside>}
    </>;
}
