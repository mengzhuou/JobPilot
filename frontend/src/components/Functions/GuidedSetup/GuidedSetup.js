import React,{useEffect,useRef,useState} from 'react';
import {useSelector} from 'react-redux';
import {useNavigate,useLocation} from 'react-router-dom';
import Dialog from '@mui/material/Dialog';
import {getUserProfile,getResumes,saveOnboarding} from '../../../connector';
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
    const user=useSelector(state=>state.studentData);
    const {pathname}=useLocation();
    const applicationPage=['/autofill','/resume-enhancement'].includes(pathname.replace(/\/$/,''));
    const isAdmin=useSelector(state=>state.studentData?.role==='admin');
    const visibleSteps=steps.filter(step=>step.path!=='/loops'||isAdmin);
    const navigate=useNavigate();
    const [guide,setGuide]=useState(null),[expanded,setExpanded]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const progress=useRef(null),queued=useRef(null),saving=useRef(false),latest=useRef(null);
    const account=useRef(user?.id),mounted=useRef(true);
    account.current=user?.id;
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    // One write at a time; while it is pending, keep only the newest step.
    // This prevents slow responses from moving the visible guide backward.
    const flushProgress=async()=>{
        if(saving.current)return;
        saving.current=true;setBusy(true);
        try {
            while(queued.current){
                const item=queued.current;queued.current=null;
                if(item.account!==account.current)continue;
                try {
                    const saved=await saveOnboarding(item.state);
                    if(mounted.current&&item.account===account.current&&latest.current===item){
                        progress.current={account:item.account,state:saved};setGuide(saved);setError('');
                    }
                } catch {
                    if(mounted.current&&item.account===account.current&&latest.current===item)
                        setError('Could not save your progress. Your current step is kept here; retry to save it to your account.');
                }
            }
        } finally {saving.current=false;if(mounted.current)setBusy(false);}
    };
    const persistProgress=state=>{
        const item={account:user.id,state};
        latest.current=item;queued.current=item;progress.current=item;
        setGuide(state);setError('');void flushProgress();
    };
    useEffect(()=>{
        let active=true;setGuide(null);
        if(!authenticated||applicationPage)return ()=>{active=false;};
        if(progress.current?.account===user?.id){setGuide(progress.current.state);return ()=>{active=false;};}
        (async()=>{
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
    },[authenticated,user,applicationPage]);
    if(!authenticated||applicationPage||!guide)return null;
    const retry=()=>persistProgress(progress.current.state);
    if(guide.status!=='active')return error?<aside className="guided-save-notice" aria-label="Guide progress save">
        <p role="alert">{error}</p>
        <button onClick={retry}>Retry save</button>
    </aside>:null;
    const index=Math.min(Math.max(guide.step,0),visibleSteps.length-1),step=visibleSteps[index];
    const advance=status=>{
        persistProgress({status,step:status==='active'?index+1:index});
        setExpanded(true);
    };
    const openStep=()=>{
        setExpanded(false);
        navigate(step.section?'/profile':step.path,{state:step.section?{guidedSection:step.section}:step.state});
    };
    return <>
        <Dialog open={expanded} onClose={()=>setExpanded(false)} maxWidth="sm" fullWidth aria-labelledby="guided-setup-title">
            <div className="guided-setup">
                <span className="guided-setup-eyebrow">YOUR JOBPILOT QUICK START · {index+1} / {visibleSteps.length}</span>
                <progress value={index+1} max={visibleSteps.length} aria-label="Walkthrough progress"/>
                <h2 id="guided-setup-title">{step.title}</h2><p>{step.text}</p>
                {step.action && <button className="guided-setup-open" onClick={openStep}>{step.action} <span aria-hidden="true">↗</span></button>}
                {error && <p role="alert">{error} <button onClick={retry}>Retry save</button></p>}
                <div className="guided-setup-actions"><button onClick={()=>advance('skipped')}>Skip</button><button onClick={()=>advance(index===visibleSteps.length-1?'completed':'active')}>{index===visibleSteps.length-1?'Finish':'Next Step'}</button></div>
                <small role="status">{busy?'Saving progress in the background…':error?'Progress has not been saved to your account yet.':'Your progress is saved to your account. Skipping or finishing stops future automatic prompts.'}</small>
            </div>
        </Dialog>
        {!expanded && <aside className="guided-setup-dock" aria-label="Profile setup guide"><button onClick={()=>setExpanded(true)}>Continue guide · {index+1}/{visibleSteps.length} <span aria-hidden="true">→</span></button></aside>}
    </>;
}
