(() => {
    const looksLikeApplication = ({host='',text='',controls=0,hasResume=false,hasEmail=false,hasPassword=false}) => {
        if(controls<2 || hasPassword)return false;
        const ats=/(^|\.)(ashbyhq\.com|greenhouse\.io|lever\.co|myworkdayjobs\.com|smartrecruiters\.com|jobvite\.com|icims\.com|workable\.com)$/.test(host);
        return /\b(?:submit|send)\s+(?:my\s+)?application\b/i.test(text) || (hasResume && (hasEmail || /\b(apply|application|candidate)\b/i.test(text))) || (ats && hasEmail && /\b(application|apply for|apply to)\b/i.test(text));
    };
    if(typeof module!=='undefined')module.exports={looksLikeApplication};
    if(typeof window==='undefined' || window.__JOBPILOT_DETECTOR__)return;
    window.__JOBPILOT_DETECTOR__=true;
    let timer,interval,observer,dead=false,signature='',dismissed='',prompt;
    const stop=()=>{dead=true;clearTimeout(timer);clearInterval(interval);observer?.disconnect();prompt?.remove();document.removeEventListener('input',schedule,true);document.removeEventListener('change',schedule,true);document.removeEventListener('visibilitychange',activated);};
    const send=async message=>{try {if(!chrome.runtime?.id){stop();return null;}return await chrome.runtime.sendMessage(message);}catch(error){if(/context invalidated|receiving end/i.test(error.message))stop();return null;}};
    const showPrompt=()=>{
        if(prompt?.isConnected || dismissed===location.href)return;
        prompt=document.createElement('div');prompt.id='jobpilot-application-prompt';
        const shadow=prompt.attachShadow({mode:'closed'});
        const style=document.createElement('style');style.textContent=':host{position:fixed;bottom:20px;right:20px;z-index:2147483646;font:13px system-ui}aside{background:#fff;border:1px solid #c7d7ee;border-radius:13px;padding:14px;box-shadow:0 8px 30px #24365430;max-width:290px;color:#21344e}strong{display:block;margin-bottom:8px}button{font:inherit;cursor:pointer;border:0;border-radius:7px;padding:9px 12px;background:#3468b7;color:white}.dismiss{background:none;color:#61728c;margin-left:5px}';
        const box=document.createElement('aside');box.setAttribute('aria-label','JobPilot application detected');
        const title=document.createElement('strong');title.textContent='JobPilot found an application';
        const open=document.createElement('button');open.textContent='Open JobPilot';open.type='button';
        open.addEventListener('click',async event=>{if(!event.isTrusted)return;const response=await send({type:'JOBPILOT_OPEN_DETECTED'});if(response?.ok)prompt.remove();else title.textContent='Click the JobPilot toolbar icon to open.';});
        const close=document.createElement('button');close.type='button';close.className='dismiss';close.textContent='Dismiss';close.addEventListener('click',()=>{dismissed=location.href;prompt.remove();});
        box.append(title,open,close);shadow.append(style,box);document.documentElement.append(prompt);
    };
    const check=async()=>{
        if(dead || document.visibilityState==='hidden' || document.getElementById('jobpilot-autofill-overlay'))return;
        const controls=Array.from(document.querySelectorAll('input,textarea,select,[role="combobox"],.ashby-application-form-input-yesno')).filter(node=>!node.disabled && node.type!=='hidden' && (node.getClientRects().length || node.type==='file'));
        const text=[document.title,...Array.from(document.querySelectorAll('h1,h2,legend,label,button,input[type=submit]')).slice(0,250).map(node=>node.innerText||node.value||'')].join(' ').slice(0,16000);
        const detected=looksLikeApplication({host:location.hostname,text,controls:controls.length,hasPassword:controls.some(node=>node.type==='password'),hasEmail:controls.some(node=>node.type==='email'||/email/i.test(`${node.name} ${node.id}`)),hasResume:controls.some(node=>node.type==='file') && /\b(resume|résumé|cv|curriculum vitae)\b/i.test(text)});
        if(!detected){signature='';prompt?.remove();return;}
        // Compare only control state, never transmit answers or page text.
        const next=location.href+'|'+controls.map(node=>[node.id,node.name,node.type,node.value?.length,node.checked,node.selectedIndex,node.getAttribute('aria-invalid'),node.getAttribute('aria-pressed')].join(':')).join('|');
        const changed=next!==signature;signature=next;
        const response=await send({type:changed?'JOBPILOT_APPLICATION_DETECTED':'JOBPILOT_PANEL_STATUS'});
        if(response?.data?.panelOpen)prompt?.remove();else if(response?.ok)showPrompt();
    };
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>check().catch(()=>{}),900);};
    const activated=()=>{if(document.visibilityState!=='hidden'){signature='';schedule();}};
    observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-invalid','aria-pressed','hidden']});
    document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);
    document.addEventListener('visibilitychange',activated);
    interval=setInterval(()=>check().catch(()=>{}),5000);schedule();
})();
