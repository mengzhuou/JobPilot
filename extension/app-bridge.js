(() => {
    if (window.__JOBPILOT_APP_BRIDGE__) return;
    window.__JOBPILOT_APP_BRIDGE__ = true;
    const markReady = () => { document.documentElement.dataset.jobpilotExtension = "ready"; };
    if (document.documentElement) markReady();
    else document.addEventListener("DOMContentLoaded", markReady, { once: true });
    const publish = data => window.postMessage({ source: "jobpilot-extension", ...data }, window.location.origin);
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
