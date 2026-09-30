const DEFAULT_BACKEND_URL = "http://localhost:3500";
importScripts("application-lifecycle.js");
importScripts("request-payload.js");
const applicationLifecycle = createApplicationLifecycle(chrome);
const installDetector = async tabId => {
    const frames=await chrome.webNavigation.getAllFrames({tabId}).catch(()=>[{frameId:0}]);
    await Promise.all((frames||[]).filter(frame=>!/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(frame.url||'')).map(frame=>chrome.scripting.executeScript({target:{tabId,frameIds:[frame.frameId]},files:['application-detector.js']}).catch(()=>{})));
};
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "complete") applicationLifecycle.ready(tabId).catch(console.error);
    if (change.status === 'complete') installDetector(tabId).catch(()=>{});
});
chrome.webNavigation.onCompleted.addListener(details => {
    if (details.frameId !== 0) applicationLifecycle.ready(details.tabId).catch(console.error);
    if (details.frameId !== 0 && !/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(details.url||'')) chrome.scripting.executeScript({target:{tabId:details.tabId,frameIds:[details.frameId]},files:['application-detector.js']}).catch(()=>{});
});
chrome.tabs.onRemoved.addListener(tabId => applicationLifecycle.removed(tabId).catch(console.error));
const STORAGE_KEYS = Object.freeze({
    backendUrl: "jobpilotBackendUrl",
    token: "jobpilotExtensionToken",
    expiresAt: "jobpilotExtensionExpiresAt",
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

const storageGet = keys => chrome.storage.local.get(keys);
const storageSet = values => chrome.storage.local.set(values);
const storageRemove = keys => chrome.storage.local.remove(keys);

const connectionSettings = async () => {
    const stored = await storageGet(Object.values(STORAGE_KEYS));
    return {
        backendUrl: String(stored[STORAGE_KEYS.backendUrl] || DEFAULT_BACKEND_URL).replace(/\/$/, ""),
        token: stored[STORAGE_KEYS.token] || "",
        expiresAt: stored[STORAGE_KEYS.expiresAt] || null,
    };
};

const apiRequest = async (path, { method = "GET", body, requiresToken = true } = {}) => {
    const settings = await connectionSettings();
    if (requiresToken && !settings.token) throw new Error("Connect this extension to your JobPilot account first.");
    const response = await fetch(`${settings.backendUrl}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(requiresToken ? { Authorization: `Bearer ${settings.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
        // An old in-flight request must not erase a newly connected session.
        if (response.status === 401 && requiresToken && (await connectionSettings()).token === settings.token) {
            await storageRemove([STORAGE_KEYS.token, STORAGE_KEYS.expiresAt]);
        }
        const error = new Error(response.status === 413 ? "This application has too much data for one request. Try Rescan with the latest JobPilot extension; oversized questions may need manual entry." : payload.message || `JobPilot request failed (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return payload;
};

const arrayBufferToBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const downloadPrimaryResume = async () => {
    const settings = await connectionSettings();
    if (!settings.token) throw new Error("Connect this extension to your JobPilot account first.");
    const response = await fetch(`${settings.backendUrl}/api/extension/primary-resume`, {
        headers: { Authorization: `Bearer ${settings.token}` },
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `Primary resume download failed (${response.status}).`);
    }
    const encodedName = response.headers.get("X-JobPilot-Filename") || "resume.pdf";
    let fileName = "resume.pdf";
    try { fileName = decodeURIComponent(encodedName); } catch { fileName = encodedName; }
    return {
        fileName,
        mimeType: response.headers.get("content-type") || "application/octet-stream",
        base64: arrayBufferToBase64(await response.arrayBuffer()),
    };
};

const activeTab = async (targetId, allowUnsupported=false) => {
    const tab = targetId ? await chrome.tabs.get(targetId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id) throw new Error("No active browser tab was found.");
    if (!allowUnsupported && !/^https?:/i.test(tab.url || "")) throw new Error("Open a job application webpage before using JobPilot.");
    return tab;
};

const sendToFrame = (tabId, frameId, message) => chrome.tabs.sendMessage(tabId, message, { frameId });

const ensureContentScript = async (tab, frameId = 0) => {
    try {
        await sendToFrame(tab.id, frameId, { type: "JOBPILOT_PING" });
        return;
    } catch (error) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [frameId] },
                files: ["content-script.js"],
            });
        } catch (injectionError) {
            throw new Error("JobPilot cannot access this page. Open the extension from a supported application page or grant site access in Chrome.");
        }
    }
};

const scanActiveTab = async targetId => {
    const tab = await activeTab(targetId,true);
    if(!/^https?:/i.test(tab.url||''))return {tabId:tab.id,supported:false,fields:[],job:{url:tab.url}};
    await installDetector(tab.id);
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [{ frameId: 0 }]);
    const eligibility=await Promise.all((frames || [{frameId:0}]).map(async frame=>{
        if(/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(frame.url||''))return false;
        try{return (await sendToFrame(tab.id,frame.frameId,{type:'JOBPILOT_APPLICATION_STATUS'}))?.supported===true;}catch{return false;}
    }));
    if(!eligibility.some(Boolean))return {tabId:tab.id,supported:false,fields:[],job:{url:tab.url}};
    await ensureContentScript(tab);
    const responses = await Promise.all((frames || [{ frameId: 0 }]).map(async frame => {
        // CAPTCHA frames are not application questions and must stay manual.
        if (/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(frame.url || "")) return null;
        try {
            await ensureContentScript(tab, frame.frameId);
            const response = await sendToFrame(tab.id, frame.frameId, { type: "JOBPILOT_SCAN_FIELDS" });
            return response ? { ...response, frameId: frame.frameId } : null;
        } catch (error) {
            return { frameId: frame.frameId, inaccessible: true };
        }
    }));
    const successful = responses.filter(response => response && !response.inaccessible);
    if (!successful.length) throw new Error("JobPilot could not inspect this application page.");
    const top = successful.find(response => response.frameId === 0) || successful[0];
    return {
        tabId: tab.id,
        inaccessibleFrames: responses.filter(response => response?.inaccessible).map(response => response.frameId),
        mode: await applicationLifecycle.modeForTab(tab.id),
        job: { ...top.job, url: tab.url || top.job?.url || "" },
        unavailable: successful.some(response => response.unavailable),
        submission: {
            ready: successful.filter(response => response.submission?.available).length === 1
                && !responses.some(response => response?.inaccessible)
                && successful.some(response => response.submission?.ready)
                && !successful.some(response => (response.fields || []).some(field => (field.required && !field.filled)
                    || (field.hasError && (field.required || String(field.currentValue || "").trim())))),
            frameId: successful.find(response => response.submission?.available)?.frameId,
        },
        fields: successful.flatMap(response => (response.fields || []).map(field => ({
            ...field,
            fieldKey: `${response.frameId}::${field.fieldKey}`,
        }))),
    };
};

const attachResumeToActiveTab = async (tab, fileFields) => {
    if (!fileFields.length) return [];
    let resume;
    try {
        resume = await downloadPrimaryResume();
    } catch (error) {
        return fileFields.map(field => ({ fieldKey: field.fieldKey, status: "failed", message: error.message }));
    }
    return Promise.all(fileFields.map(async field => {
        const [frameText, ...keyParts] = String(field.fieldKey || "").split("::");
        const frameId = Number(frameText);
        if (!Number.isInteger(frameId) || !keyParts.length) {
            return { fieldKey: field.fieldKey, status: "failed", message: "The resume field could not be located." };
        }
        try {
            const response = await sendToFrame(tab.id, frameId, {
                type: "JOBPILOT_ATTACH_RESUME",
                fieldKey: keyParts.join("::"),
                file: resume,
            });
            return {
                fieldKey: field.fieldKey,
                status: response?.status || "failed",
                message: response?.message,
            };
        } catch (error) {
            return { fieldKey: field.fieldKey, status: "failed", message: "The application rejected the resume attachment." };
        }
    }));
};

const applyToActiveTab = async (answers, fileFields = [], targetId) => {
    const tab = await activeTab(targetId);
    await ensureContentScript(tab);
    const grouped = (answers || []).reduce((all, answer) => {
        const [frameText, ...keyParts] = String(answer.fieldKey || "").split("::");
        const frameId = Number(frameText);
        if (!Number.isInteger(frameId) || !keyParts.length) return all;
        if (!all[frameId]) all[frameId] = [];
        all[frameId].push({ ...answer, fieldKey: keyParts.join("::") });
        return all;
    }, {});
    const responseGroups = await Promise.all(Object.entries(grouped).map(async ([frameIdText, frameAnswers]) => {
        const frameId = Number(frameIdText);
        try {
            const response = await sendToFrame(tab.id, frameId, {
                type: "JOBPILOT_APPLY_PLAN",
                answers: frameAnswers,
            });
            return (response?.results || []).map(result => ({
                ...result,
                fieldKey: `${frameId}::${result.fieldKey}`,
            }));
        } catch (error) {
            return frameAnswers.map(answer => ({
                fieldKey: `${frameId}::${answer.fieldKey}`,
                status: "failed",
                message: "The application frame changed before it could be filled.",
            }));
        }
    }));
    const fileResults = await attachResumeToActiveTab(tab, fileFields);
    return [...responseGroups.flat(), ...fileResults];
};

const focusInActiveTab = async (fieldKey, targetId) => {
    const tab = await activeTab(targetId);
    await ensureContentScript(tab);
    const [frameText, ...keyParts] = String(fieldKey || "").split("::");
    const frameId = Number(frameText);
    if (!Number.isInteger(frameId) || !keyParts.length) throw new Error("This application field could not be located.");
    const response = await sendToFrame(tab.id, frameId, {
        type: "JOBPILOT_FOCUS_FIELD",
        fieldKey: keyParts.join("::"),
    });
    if (!response?.focused) throw new Error(response?.error || "This application field could not be located.");
    return response;
};

const isPanelSender = sender => Boolean(sender.url) && String(sender.url).split('?')[0] === chrome.runtime.getURL('sidepanel.html');
const showPagePanel = async (tabId, mode) => {
    await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['page-panel.js']});
    return chrome.tabs.sendMessage(tabId,{type:'JOBPILOT_PAGE_PANEL',mode},{frameId:0});
};
const handleMessage = async (message, sender) => {
    const panelTabId = isPanelSender(sender) ? sender.tab?.id : undefined;
    switch (message?.type) {
        case 'JOBPILOT_PANEL_VISIBILITY': {
            if(!isPanelSender(sender) || !['collapsed','closed'].includes(message.mode))throw new Error('Use the JobPilot panel controls.');
            const tab=await activeTab(panelTabId);
            await showPagePanel(tab.id,message.mode);
            if(!panelTabId){
                if(chrome.sidePanel.close)await chrome.sidePanel.close({windowId:tab.windowId});
                else throw new Error('Use Chrome’s × button to close the native panel. Your floating launcher is ready.');
            }
            return {ok:true};
        }
        case 'JOBPILOT_CONNECT_ACCOUNT': {
            const url=new URL(sender.url || 'about:blank');
            const trusted=sender.tab?.id && sender.frameId===0 && url.pathname==='/profile' && chrome.runtime.getManifest().content_scripts.filter(script=>script.js.includes('app-bridge.js')).some(script=>script.matches.includes(`${url.origin}/*`));
            if(!trusted)throw new Error('Connect only from your signed-in JobPilot Profile page.');
            const settings=await connectionSettings();
            if(new URL(settings.backendUrl).hostname!==url.hostname)throw new Error('The extension server and Profile website do not match. Check the server setting or use manual pairing.');
            const payload=await apiRequest('/api/extension/exchange',{method:'POST',requiresToken:false,body:{code:message.code,deviceName:'JobPilot Chrome extension'}});
            await storageSet({[STORAGE_KEYS.token]:payload.token,[STORAGE_KEYS.expiresAt]:payload.expiresAt});
            await chrome.runtime.sendMessage({type:'JOBPILOT_CONNECTED'}).catch(()=>{});
            return {connected:true,expiresAt:payload.expiresAt};
        }
        case 'JOBPILOT_OPEN_SIGN_IN': {
            if(!isPanelSender(sender))throw new Error('Start sign-in from the extension panel.');
            const backend=new URL(message.backendUrl || DEFAULT_BACKEND_URL);
            if(backend.protocol!=='https:' && !(backend.protocol==='http:' && ['localhost','127.0.0.1'].includes(backend.hostname)))throw new Error('Use HTTPS for your JobPilot server.');
            const origins=chrome.runtime.getManifest().content_scripts.filter(script=>script.js.includes('app-bridge.js')).flatMap(script=>script.matches).filter(pattern=>pattern.endsWith('/*')).map(pattern=>pattern.slice(0,-2));
            const origin=origins.find(origin=>new URL(origin).hostname===backend.hostname);
            if(!origin)throw new Error('This build does not include your JobPilot website. Use manual pairing or configure its app-bridge origin.');
            await storageSet({[STORAGE_KEYS.backendUrl]:backend.origin});
            await chrome.tabs.create({url:`${origin}/profile?connectExtension=1`});
            return {opened:true};
        }
        case "JOBPILOT_LAUNCH":
            return applicationLifecycle.launch(message, sender);
        case "JOBPILOT_LAUNCH_STATUS":
            return applicationLifecycle.status(sender);
        case "JOBPILOT_APPLICATION_SAVED":
            return applicationLifecycle.saved(message, sender);
        case "JOBPILOT_APPLICATION_FORM_SEEN":
        case "JOBPILOT_APPLICATION_SUBMIT_ATTEMPT":
        case "JOBPILOT_APPLICATION_SUBMITTED":
            return applicationLifecycle.observed(message, sender);
        case "JOBPILOT_GET_CONNECTION": {
            const settings = await connectionSettings();
            return {
                connected: Boolean(settings.token),
                backendUrl: settings.backendUrl,
                expiresAt: settings.expiresAt,
            };
        }
        case "JOBPILOT_PAIR": {
            const backendUrl = String(message.backendUrl || DEFAULT_BACKEND_URL).replace(/\/$/, "");
            await storageSet({ [STORAGE_KEYS.backendUrl]: backendUrl });
            const payload = await apiRequest("/api/extension/exchange", {
                method: "POST",
                requiresToken: false,
                body: { code: message.code, deviceName: "JobPilot Chrome extension" },
            });
            await storageSet({
                [STORAGE_KEYS.token]: payload.token,
                [STORAGE_KEYS.expiresAt]: payload.expiresAt,
            });
            return { connected: true, expiresAt: payload.expiresAt };
        }
        case "JOBPILOT_DISCONNECT":
            await apiRequest("/api/extension/connection", { method: "DELETE" }).catch(() => {});
            await storageRemove([STORAGE_KEYS.token, STORAGE_KEYS.expiresAt]);
            return { connected: false };
        case "JOBPILOT_SCAN":
            return scanActiveTab(panelTabId);
        case "JOBPILOT_SUBMIT": {
            if (!isPanelSender(sender)) throw new Error("Submit must be requested from the JobPilot panel.");
            const scan = await scanActiveTab(panelTabId);
            if (scan.tabId !== message.tabId || scan.job.url !== message.jobUrl) throw new Error("The active job changed. Rescan before submitting.");
            if (scan.unavailable || !scan.submission.ready) throw new Error("Complete required fields and resolve errors, then rescan.");
            await applicationLifecycle.prepareSubmit(scan.tabId);
            return sendToFrame(scan.tabId, scan.submission.frameId, { type: "JOBPILOT_SUBMIT_FORM" });
        }
        case "JOBPILOT_BUILD_PLAN": {
            const answers=[],missing=new Set();
            const requestBatch = async fields => {
                try {return [await apiRequest('/api/extension/fill-plan',{method:'POST',body:{fields}})];}
                catch(error){
                    if(error.status !== 413 || fields.length<=1) throw error;
                    const half=Math.ceil(fields.length/2);
                    return [...await requestBatch(fields.slice(0,half)),...await requestBatch(fields.slice(half))];
                }
            };
            for(const fields of applicationFieldBatches(message.fields)) for(const plan of await requestBatch(fields)) {
                answers.push(...plan.answers);(plan.missingProfileFields||[]).forEach(item=>missing.add(item));
            }
            return {answers,missingProfileFields:[...missing],summary:{total:answers.length,ready:answers.filter(a=>a.action==='fill').length,needsReview:answers.filter(a=>a.action==='ask_user').length,skipped:answers.filter(a=>a.action==='skip').length}};
        }
        case "JOBPILOT_APPLY":
            return { results: await applyToActiveTab(message.answers, message.fileFields || [], panelTabId) };
        case "JOBPILOT_FOCUS":
            return focusInActiveTab(message.fieldKey,panelTabId);
        case "JOBPILOT_AI_PLAN": {
            const tab = await activeTab(panelTabId);
            if (await applicationLifecycle.modeForTab(tab.id) !== "loop") throw new Error("AI generation is reserved for Loop applications.");
            const style = String((await chrome.storage.local.get("jobpilot.aiWritingStyle"))["jobpilot.aiWritingStyle"] || "").slice(0, 1000);
            return apiRequest("/api/extension/ai-plan", {
                method: "POST",
                body: {
                    fields: (message.fields || []).map(compactApplicationField),
                    job: message.job,
                    guidance: message.guidance,
                    writingStyle: style,
                    draftAnswers: message.draftAnswers,
                },
            });
        }
        case "JOBPILOT_SAVE_ANSWER_MEMORY":
            return apiRequest("/api/extension/answer-memory", {
                method: "POST",
                body: { memories: message.memories, job: message.job },
            });
        default:
            throw new Error("Unknown JobPilot extension action.");
    }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!String(message?.type || "").startsWith("JOBPILOT_")) return false;
    if (message.type === "JOBPILOT_RESCAN_REQUEST") return false;
    if (['JOBPILOT_APPLICATION_DETECTED','JOBPILOT_PANEL_STATUS','JOBPILOT_OPEN_DETECTED'].includes(message.type)) {
        if (!sender.tab?.id) return false;
        // Keep open() directly in the content-script click's message handler;
        // awaiting any discovery work first can lose Chrome's user gesture.
        const opening=message.type==='JOBPILOT_OPEN_DETECTED' ? chrome.sidePanel.open({windowId:sender.tab.windowId}) : Promise.resolve();
        opening.then(async()=>{
            const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).catch(()=>[]);
            const panelOpen=contexts.some(context=>context.windowId===sender.tab.windowId);
            if(!panelOpen && message.type!=='JOBPILOT_OPEN_DETECTED')await showPagePanel(sender.tab.id,'auto');
            if(message.type!=='JOBPILOT_PANEL_STATUS') await chrome.runtime.sendMessage({type:'JOBPILOT_RESCAN_REQUEST',automatic:message.type==='JOBPILOT_APPLICATION_DETECTED',tabId:sender.tab.id,windowId:sender.tab.windowId}).catch(()=>{});
            sendResponse({ok:true,data:{panelOpen}});
        }).catch(()=>sendResponse({ok:false,error:'Click the JobPilot toolbar icon to open the side panel.'}));
        return true;
    }
    handleMessage(message, sender)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => sendResponse({ ok: false, error: error.message || "JobPilot extension error." }));
    return true;
});
