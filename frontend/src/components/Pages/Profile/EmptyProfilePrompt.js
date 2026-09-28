import React, {useEffect,useState} from 'react';
import Dialog from '@mui/material/Dialog';
import {getSignedInUser} from '../../../connector';

export default function EmptyProfilePrompt({eligible,onUpload}) {
    const [accountKey,setAccountKey]=useState(null);
    const [dismissed,setDismissed]=useState(false);
    const [storageError,setStorageError]=useState('');
    useEffect(()=>{
        let active=true;
        if (eligible) getSignedInUser().then(user=>{
            if (!active || !user?.id) return;
            const key=`jobpilot.hideResumeProfilePrompt.${user.id}`;
            let hidden=false;
            try { hidden=localStorage.getItem(key)==='true'; } catch { /* Still offer onboarding when storage is blocked. */ }
            if (!hidden) setAccountKey(key);
        }).catch(()=>{});
        return ()=>{active=false;};
    },[eligible]);
    const never=()=>{
        try { localStorage.setItem(accountKey,'true'); setDismissed(true); }
        catch { setStorageError('Your browser could not save this preference. Choose “Not now” to dismiss for this visit.'); }
    };
    return <Dialog open={Boolean(eligible && accountKey && !dismissed)} onClose={()=>setDismissed(true)} aria-labelledby="empty-profile-title" maxWidth="sm" fullWidth>
        <div className="empty-profile-prompt"><span className="strength-eyebrow">BUILD YOUR PROFILE</span><h2 id="empty-profile-title">Start with your résumé?</h2><p>Your profile is at 0%. Upload a résumé and choose to parse it to fill in your profile information, then review the results.</p><p>You can also fill everything out manually.</p>{storageError && <p role="alert">{storageError}</p>}
        <div className="empty-profile-actions"><button autoFocus onClick={()=>{setDismissed(true);onUpload();}}>Go to résumés</button><button onClick={()=>setDismissed(true)}>Not now</button><button onClick={never}>Never display this message</button></div><small>“Never display” is remembered for your account in this browser.</small></div>
    </Dialog>;
}
