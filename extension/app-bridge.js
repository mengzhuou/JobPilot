(() => {
    if (window.__JOBPILOT_APP_BRIDGE__) return;
    window.__JOBPILOT_APP_BRIDGE__ = true;
    const markReady = () => { document.documentElement.dataset.jobpilotExtension = "ready"; document.documentElement.dataset.jobpilotLogin = 'ready'; };
    if (document.documentElement) markReady();
    else document.addEventListener("DOMContentLoaded", markReady, { once: true });
    const publish = data => window.postMessage({ source: "jobpilot-extension", ...data }, window.location.origin);
    let pendingLogin=null;
    window.addEventListener('jobpilot:connect',event=>{
        if(location.pathname!=='/profile' || !navigator.userActivation.isActive || typeof event.detail?.requestId!=='string')return;
        pendingLogin={requestId:event.detail.requestId,expires:Date.now()+60000};
    });
    const request = (message, callback) => chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError?.message || (!response?.ok && response?.error);
        if (error) publish({ type: "launch-error", sessionId: message.sessionId, error });
        else callback?.(response?.data);
    });
    // A synchronous DOM event preserves the button's user activation for Chrome's
    // sidePanel.open and optional site-permission request.
    window.addEventListener("jobpilot:launch", event => {
        if (!["/autofill", "/loops"].includes(location.pathname) || !navigator.userActivation.isActive) return;
        const { jobUrl, sessionId } = event.detail || {};
        request({ type: "JOBPILOT_LAUNCH", jobUrl, sessionId }, data => publish({ type: "launch-state", ...data }));
    });
    window.addEventListener("message", event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.source !== "jobpilot-app") return;
        if(event.data.type==='connect-account' && location.pathname==='/profile'){
            if(!pendingLogin || pendingLogin.requestId!==event.data.requestId || pendingLogin.expires<Date.now())return;
            const requestId=pendingLogin.requestId;pendingLogin=null;
            try {chrome.runtime.sendMessage({type:'JOBPILOT_CONNECT_ACCOUNT',code:event.data.code},response=>{
                const error=chrome.runtime.lastError?.message || (!response?.ok && response?.error);
                publish({type:'connect-result',requestId,error:error || '',connected:Boolean(response?.ok && response?.data?.connected)});
            });} catch {publish({type:'connect-result',requestId,error:'Reload this page after updating the extension.'});}
        }
        if (event.data.type === "saved") {
            request({ type: "JOBPILOT_APPLICATION_SAVED", sessionId: event.data.sessionId }, () => publish({ type: "saved-ack", sessionId: event.data.sessionId }));
        }
        if (event.data.type === "get-launch") request({ type: "JOBPILOT_LAUNCH_STATUS" }, data => {
            if (data) publish({ type: "launch-state", ...data });
        });
    });
    chrome.runtime.onMessage.addListener(message => {
        if (message.type === "JOBPILOT_LAUNCH_STATE") publish({ type: "launch-state", ...message.session });
    });
})();
