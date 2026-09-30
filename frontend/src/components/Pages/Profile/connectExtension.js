import {createExtensionPairingCode} from '../../../connector';

export const connectExtension=()=>{
    if(document.documentElement.dataset.jobpilotLogin!=='ready')return Promise.reject(new Error('Load or update the JobPilot extension in Chrome, then reload this page. Manual pairing is available below.'));
    const requestId=window.crypto.randomUUID();
    // Arm the bridge synchronously while the Connect button has user activation.
    window.dispatchEvent(new CustomEvent('jobpilot:connect',{detail:{requestId}}));
    return new Promise((resolve,reject)=>{
        let settled=false;
        const cleanup=()=>{settled=true;clearTimeout(timer);window.removeEventListener('message',receive);};
        const receive=event=>{
            if(event.source!==window || event.origin!==window.location.origin || event.data?.source!=='jobpilot-extension' || event.data.type!=='connect-result' || event.data.requestId!==requestId)return;
            cleanup();
            if(event.data.connected)resolve();else reject(new Error(event.data.error || 'Connection failed. Please try again.'));
        };
        const timer=setTimeout(()=>{cleanup();reject(new Error('The extension did not respond. Reload it and try again.'));},30000);
        window.addEventListener('message',receive);
        createExtensionPairingCode().then(pairing=>{if(!settled)window.postMessage({source:'jobpilot-app',type:'connect-account',requestId,code:pairing.code},window.location.origin);}).catch(error=>{cleanup();reject(error);});
    });
};
