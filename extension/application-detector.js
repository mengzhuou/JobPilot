(() => {
    const looksLikeApplication = ({host='',text='',controls=0,hasResume=false,hasEmail=false,hasPassword=false}) => {
        if(controls<2 || hasPassword)return false;
        const ats=/(^|\.)(ashbyhq\.com|greenhouse\.io|lever\.co|myworkdayjobs\.com|smartrecruiters\.com|jobvite\.com|icims\.com|workable\.com)$/.test(host);
        return /\b(?:submit|send)\s+(?:my\s+)?application\b/i.test(text) || (hasResume && (hasEmail || /\b(apply|application|candidate)\b/i.test(text))) || (ats && hasEmail && /\b(application|apply for|apply to)\b/i.test(text));
    };
    if(typeof module!=='undefined')module.exports={looksLikeApplication};
    if(typeof window==='undefined' || window.__JOBPILOT_DETECTOR__)return;
    window.__JOBPILOT_DETECTOR__=true;
    let timer,interval,observer,dead=false,signature='';
    const stop=()=>{dead=true;clearTimeout(timer);clearInterval(interval);observer?.disconnect();document.removeEventListener('input',schedule,true);document.removeEventListener('change',schedule,true);document.removeEventListener('visibilitychange',activated);};
    const send=async message=>{try {if(!chrome.runtime?.id){stop();return null;}return await chrome.runtime.sendMessage(message);}catch(error){if(/context invalidated|receiving end/i.test(error.message))stop();return null;}};
    const inspect=()=>{
        const controls=Array.from(document.querySelectorAll('input,textarea,select,[role="combobox"],.ashby-application-form-input-yesno')).filter(node=>!node.disabled && node.type!=='hidden' && (node.getClientRects().length || node.type==='file'));
        const text=[document.title,...Array.from(document.querySelectorAll('h1,h2,legend,label,button,input[type=submit]')).slice(0,250).map(node=>node.innerText||node.value||'')].join(' ').slice(0,16000);
        const detected=looksLikeApplication({host:location.hostname,text,controls:controls.length,hasPassword:controls.some(node=>node.type==='password'),hasEmail:controls.some(node=>node.type==='email'||/email/i.test(`${node.name} ${node.id}`)),hasResume:controls.some(node=>node.type==='file') && /\b(resume|resume|cv|curriculum vitae)\b/i.test(text)});
        return {detected,controls};
    };
    chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
        if(message.type==='JOBPILOT_APPLICATION_STATUS')respond({supported:inspect().detected});
    });
    const check=async()=>{
        if(dead || document.visibilityState==='hidden' || document.getElementById('jobpilot-autofill-overlay'))return;
        const {detected,controls}=inspect();
        if(!detected){signature='';return;}
        // Compare only control state, never transmit answers or page text.
        const next=location.href+'|'+controls.map(node=>[node.id,node.name,node.type,node.value?.length,node.checked,node.selectedIndex,node.getAttribute('aria-invalid'),node.getAttribute('aria-pressed')].join(':')).join('|');
        const changed=next!==signature;signature=next;
        await send({type:changed?'JOBPILOT_APPLICATION_DETECTED':'JOBPILOT_PANEL_STATUS'});
    };
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>check().catch(()=>{}),900);};
    const activated=()=>{if(document.visibilityState!=='hidden'){signature='';schedule();}};
    observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-invalid','aria-pressed','hidden']});
    document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);
    document.addEventListener('visibilitychange',activated);
    // Detect on page changes and activation, not on a perpetual polling loop.
    schedule();
})();
