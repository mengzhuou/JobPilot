import React, {useEffect, useState} from 'react';
import LoadingOverlay from './LoadingOverlay';

export default function AuthLoadingOverlay({mode='login',onDismissGoogle}) {
    const [slow,setSlow]=useState(false);
    useEffect(()=>{
        setSlow(false);
        const timer=setTimeout(()=>setSlow(true),8000);
        return ()=>clearTimeout(timer);
    },[mode]);
    const registering=mode==='register',restoring=mode==='session',loggingOut=mode==='logout',google=mode==='google';
    return <LoadingOverlay
        illustration="account"
        title={google?'Continue with Google…':loggingOut?'Signing you out…':restoring?'Opening your workspace…':registering?'Creating your account…':'Signing you in…'}
        eyebrow={loggingOut?'UNTIL YOUR NEXT OPPORTUNITY':registering?'YOUR NEXT CHAPTER STARTS HERE':'WELCOME BACK TO JOBPILOT'}
        message={google?'Choose your account in the Google window. If you closed it, return below to try again.':loggingOut?(slow?'The server is taking a little longer to end your session.':'Ending your session and returning you to sign in.'):slow?'The server is taking a little longer. We’re still connecting—no need to sign in again.':restoring?'Checking your session and reconnecting you to JobPilot.':registering?'Setting up your account for your next opportunity.':'Securely connecting to your account. Your workspace is next.'}
        footer="Your job search, ready when you are."
    >
        <div className="resume-progress-activity"><span className="resume-progress-activity-dot" aria-hidden="true"/>{google?'Waiting for Google':loggingOut?'Closing your session':restoring?'Checking session':registering?'Setting up your account':'Verifying your sign-in'}</div>
        {google && <button type="button" className="resume-progress-return" onClick={onDismissGoogle}>Back to sign in</button>}
    </LoadingOverlay>;
}
