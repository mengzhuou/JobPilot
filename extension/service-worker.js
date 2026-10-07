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
chrome.tabs.onRemoved.addListener(tabId => {
    applicationLifecycle.removed(tabId).catch(console.error);
    chrome.storage.session.get(null).then(items => chrome.storage.session.remove(Object.keys(items).filter(key => key.startsWith(`jobpilot.manual.${tabId}.`)))).catch(()=>{});
});
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

const apiRequest = async (path, { method = "GET", body, requiresToken = true, expectedToken } = {}) => {
    const settings = await connectionSettings();
    if (expectedToken !== undefined && expectedToken !== settings.token) throw new Error('Your account changed. Rescan before remembering answers.');
    if (requiresToken && !settings.token) throw new Error("Connect this extension to your JobPilot account first.");
    const response = await fetch(`${settings.backendUrl}${path}`, {
        method,
        credentials: 'omit',
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

const downloadPrimaryResume = async jobUrl => {
    const settings = await connectionSettings();
    if (!settings.token) throw new Error("Connect this extension to your JobPilot account first.");
    const response = await fetch(`${settings.backendUrl}/api/extension/primary-resume?jobUrl=${encodeURIComponent(jobUrl)}`, {
        credentials: 'omit',
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
    const rememberEnabled = (await storageGet('jobpilot.rememberManualAnswers'))['jobpilot.rememberManualAnswers'] !== false;
    if(!/^https?:/i.test(tab.url||''))return {tabId:tab.id,rememberEnabled,supported:false,fields:[],job:{url:tab.url}};
    await installDetector(tab.id);
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [{ frameId: 0 }]);
    const eligibility=await Promise.all((frames || [{frameId:0}]).map(async frame=>{
        if(/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(frame.url||''))return false;
        try{return (await sendToFrame(tab.id,frame.frameId,{type:'JOBPILOT_APPLICATION_STATUS'}))?.supported===true;}catch{return false;}
    }));
    if(!eligibility.some(Boolean))return {tabId:tab.id,rememberEnabled,supported:false,fields:[],job:{url:tab.url}};
    await ensureContentScript(tab);
    const settings = await connectionSettings();
    const responses = await Promise.all((frames || [{ frameId: 0 }]).map(async (frame, index) => {
        // CAPTCHA frames are not application questions and must stay manual.
        if (/recaptcha|hcaptcha|challenges\.cloudflare|^chrome-extension:/i.test(frame.url || "")) return null;
        try {
            await ensureContentScript(tab, frame.frameId);
            const remember = Boolean(settings.token && eligibility[index] && rememberEnabled);
            const key = `jobpilot.manual.${tab.id}.${frame.frameId}`;
            const previous=(await chrome.storage.session.get(key))[key];
            const rememberSession=previous?.token===settings.token && previous?.url===(frame.url || tab.url)
                ? previous.id : `${Date.now()}-${Math.random()}`;
            const response = await sendToFrame(tab.id, frame.frameId, { type: "JOBPILOT_SCAN_FIELDS", remember, rememberSession });
            if (remember && response?.fields?.length) await chrome.storage.session.set({[key]: {
                id:rememberSession,
                token: settings.token, url: frame.url || tab.url, jobUrl: tab.url, documentId: frame.documentId,
                fields: response.fields.map(field => ({fieldKey:field.fieldKey,label:field.label,type:field.type,name:field.name,autocomplete:field.autocomplete})),
            }});
            else await chrome.storage.session.remove(key);
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
        rememberEnabled,
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
        resume = await downloadPrimaryResume(tab.url);
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
const manualSaveQueues = new Map();
const clearManualContexts = async () => {
    const keys = Object.keys(await chrome.storage.session.get(null)).filter(key => key.startsWith('jobpilot.manual.'));
    await chrome.storage.session.remove(keys);
};
const rememberManualAnswers = (message, sender) => {
    if (!sender.tab?.id || !Number.isInteger(sender.frameId)) throw new Error('Manual answers must come from an inspected application.');
    const key = `jobpilot.manual.${sender.tab.id}.${sender.frameId}`;
    const save = (manualSaveQueues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
        const context = (await chrome.storage.session.get(key))[key];
        const enabled = (await storageGet('jobpilot.rememberManualAnswers'))['jobpilot.rememberManualAnswers'] !== false;
        const settings = await connectionSettings();
        if (!enabled || !context || context.token !== settings.token || context.url !== sender.url
            || (context.documentId && context.documentId !== sender.documentId)) throw new Error('Rescan this application to enable answer memory.');
        const answers = (Array.isArray(message.answers) ? message.answers : []).slice(0,30).flatMap(answer => {
            const field = context.fields.find(field => field.fieldKey === answer.fieldKey);
            return field ? [{question:field.label,type:field.type,name:field.name,autocomplete:field.autocomplete,values:answer.values}] : [];
        });
        if (!answers.length) return {saved:0};
        const result = await apiRequest('/api/extension/manual-answers', {method:'POST',body:{jobUrl:context.jobUrl,answers},expectedToken:context.token});
        await chrome.runtime.sendMessage({type:'JOBPILOT_MANUAL_ANSWERS_SAVED',tabId:sender.tab.id,saved:result.saved}).catch(()=>{});
        return result;
    });
    manualSaveQueues.set(key, save);
    save.finally(() => {if(manualSaveQueues.get(key)===save)manualSaveQueues.delete(key);}).catch(()=>{});
    return save;
};
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
        case 'JOBPILOT_REMEMBER_MANUAL_ANSWERS':
            return rememberManualAnswers(message, sender);
        case 'JOBPILOT_MANUAL_MEMORY_FAILED':
            if (sender.tab?.id) await chrome.runtime.sendMessage({type:'JOBPILOT_MANUAL_MEMORY_FAILED',tabId:sender.tab.id}).catch(()=>{});
            return {ok:true};
        case 'JOBPILOT_MEMORY_SETTINGS': {
            if (!isPanelSender(sender)) throw new Error('Change answer memory from the JobPilot panel.');
            await storageSet({'jobpilot.rememberManualAnswers':message.enabled === true});
            await clearManualContexts();
            return {enabled:message.enabled === true};
        }
        case 'JOBPILOT_FORGET_MANUAL_ANSWERS': {
            if (!isPanelSender(sender)) throw new Error('Manage remembered answers from the JobPilot panel.');
            const settings = await connectionSettings();
            // Pause capture and drain in-flight writes before deleting, so a
            // pending event cannot immediately recreate a forgotten answer.
            await storageSet({'jobpilot.rememberManualAnswers':false});
            await clearManualContexts();
            await Promise.allSettled([...manualSaveQueues.values()]);
            return apiRequest('/api/extension/manual-answers',{method:'DELETE',expectedToken:settings.token});
        }
        case 'JOBPILOT_RESUME_ASSESS': {
            if(!isPanelSender(sender))throw new Error('Use the JobPilot panel to assess a résumé.');
            const tab=await activeTab(panelTabId);
            if(message.job?.url!==tab.url)throw new Error('The application changed. Rescan before filling.');
            return apiRequest('/api/extension/resume-enhancements/assess',{method:'POST',body:{job:message.job}});
        }
        case 'JOBPILOT_RESUME_DISMISS': {
            if(!isPanelSender(sender)||!/^[a-f0-9-]{36}$/i.test(message.id))throw new Error('Invalid résumé request.');
            if(message.disabled===true)await apiRequest('/api/extension/resume-enhancements/preferences',{method:'PATCH',body:{disabled:true}});
            return apiRequest(`/api/extension/resume-enhancements/${message.id}/dismiss`,{method:'POST'});
        }
        case 'JOBPILOT_RESUME_ENHANCE': {
            if(!isPanelSender(sender)||!/^[a-f0-9-]{36}$/i.test(message.id))throw new Error('Invalid résumé request.');
            const settings=await connectionSettings();
            const origins=chrome.runtime.getManifest().content_scripts.filter(script=>script.js.includes('app-bridge.js')).flatMap(script=>script.matches).filter(pattern=>pattern.endsWith('/*')).map(pattern=>pattern.slice(0,-2));
            const origin=origins.find(origin=>new URL(origin).hostname===new URL(settings.backendUrl).hostname);
            if(!origin)throw new Error('Configure your JobPilot app origin in the extension to open résumé enhancement.');
            await chrome.tabs.create({url:`${origin}/resume-enhancement?id=${encodeURIComponent(message.id)}`});
            return {opened:true};
        }
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
            let memoryUnavailable = false;
            const requestBatch = async fields => {
                try {return [await apiRequest('/api/extension/fill-plan',{method:'POST',body:{fields,jobUrl:message.jobUrl}})];}
                catch(error){
                    if(error.status !== 413 || fields.length<=1) throw error;
                    const half=Math.ceil(fields.length/2);
                    return [...await requestBatch(fields.slice(0,half)),...await requestBatch(fields.slice(half))];
                }
            };
            for(const fields of applicationFieldBatches(message.fields)) for(const plan of await requestBatch(fields)) {
                answers.push(...plan.answers);(plan.missingProfileFields||[]).forEach(item=>missing.add(item));
                memoryUnavailable ||= Boolean(plan.memoryUnavailable);
            }
            return {answers,memoryUnavailable,missingProfileFields:[...missing],summary:{total:answers.length,ready:answers.filter(a=>a.action==='fill').length,needsReview:answers.filter(a=>a.action==='ask_user').length,skipped:answers.filter(a=>a.action==='skip').length}};
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
