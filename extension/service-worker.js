const DEFAULT_BACKEND_URL = "http://localhost:3500";
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
        if (response.status === 401 && requiresToken) await storageRemove([STORAGE_KEYS.token, STORAGE_KEYS.expiresAt]);
        throw new Error(payload.message || `JobPilot request failed (${response.status}).`);
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
        throw new Error(payload.message || `Primary résumé download failed (${response.status}).`);
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

const activeTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active browser tab was found.");
    if (!/^https?:/i.test(tab.url || "")) throw new Error("Open a job application webpage before using JobPilot.");
    return tab;
};

const sendToFrame = (tabId, frameId, message) => chrome.tabs.sendMessage(tabId, message, { frameId });

const ensureContentScript = async tab => {
    try {
        await sendToFrame(tab.id, 0, { type: "JOBPILOT_PING" });
        return;
    } catch (error) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ["content-script.js"],
            });
        } catch (injectionError) {
            throw new Error("JobPilot cannot access this page. Open the extension from a supported application page or grant site access in Chrome.");
        }
    }
};

const scanActiveTab = async () => {
    const tab = await activeTab();
    await ensureContentScript(tab);
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [{ frameId: 0 }]);
    const responses = await Promise.all((frames || [{ frameId: 0 }]).map(async frame => {
        try {
            const response = await sendToFrame(tab.id, frame.frameId, { type: "JOBPILOT_SCAN_FIELDS" });
            return response ? { ...response, frameId: frame.frameId } : null;
        } catch (error) {
            return null;
        }
    }));
    const successful = responses.filter(Boolean);
    if (!successful.length) throw new Error("JobPilot could not inspect this application page.");
    const top = successful.find(response => response.frameId === 0) || successful[0];
    return {
        tabId: tab.id,
        job: { ...top.job, url: tab.url || top.job?.url || "" },
        unavailable: successful.some(response => response.unavailable),
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
            return { fieldKey: field.fieldKey, status: "failed", message: "The résumé field could not be located." };
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
            return { fieldKey: field.fieldKey, status: "failed", message: "The application rejected the résumé attachment." };
        }
    }));
};

const applyToActiveTab = async (answers, fileFields = []) => {
    const tab = await activeTab();
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

const focusInActiveTab = async fieldKey => {
    const tab = await activeTab();
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

const handleMessage = async message => {
    switch (message?.type) {
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
            return scanActiveTab();
        case "JOBPILOT_BUILD_PLAN":
            return apiRequest("/api/extension/fill-plan", {
                method: "POST",
                body: { fields: message.fields },
            });
        case "JOBPILOT_APPLY":
            return { results: await applyToActiveTab(message.answers, message.fileFields || []) };
        case "JOBPILOT_FOCUS":
            return focusInActiveTab(message.fieldKey);
        case "JOBPILOT_AI_PLAN":
            return apiRequest("/api/extension/ai-plan", {
                method: "POST",
                body: {
                    fields: message.fields,
                    job: message.job,
                    guidance: message.guidance,
                    draftAnswers: message.draftAnswers,
                },
            });
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
    handleMessage(message)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => sendResponse({ ok: false, error: error.message || "JobPilot extension error." }));
    return true;
});
