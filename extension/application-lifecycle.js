/* Shared by the service worker and its lifecycle regression tests. */
const createApplicationLifecycle = chrome => {
    const originKey = id => `jobpilot.launch.origin.${id}`;
    const jobKey = id => `jobpilot.launch.job.${id}`;
    const read = async key => (await chrome.storage.session.get(key))[key];
    const queues = new Map();
    const serial = (id, action) => {
        const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action);
        queues.set(id, next);
        next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
        return next;
    };
    const save = session => chrome.storage.session.set({ [originKey(session.originTabId)]: session, [jobKey(session.jobTabId)]: session });
    const isApp = sender => {
        if (!sender.tab?.id || sender.frameId !== 0) return false;
        let url;
        try { url = new URL(sender.url || sender.tab.url); } catch { return false; }
        return url.pathname === "/autofill" && chrome.runtime.getManifest().content_scripts
            .filter(script => script.js.includes("app-bridge.js"))
            .some(script => script.matches.some(pattern => pattern === `${url.origin}/*`));
    };
    const emit = session => chrome.tabs.sendMessage(session.originTabId, {
        type: "JOBPILOT_LAUNCH_STATE", session: { sessionId: session.sessionId, status: session.status, jobUrl: session.jobUrl },
    }, { frameId: 0 }).catch(() => {});
    const rescan = session => chrome.runtime.sendMessage({ type: "JOBPILOT_RESCAN_REQUEST", tabId: session.jobTabId, windowId: session.windowId }).catch(() => {});
    const returnToApp = async session => {
        const tab = await chrome.tabs.get(session.originTabId).catch(() => null);
        if (!tab || tab.url !== session.originUrl) return false;
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return true;
    };
    const launch = (message, sender) => {
        if (!isApp(sender)) throw new Error("Open this application from JobPilot's Autofill page.");
        const url = new URL(message.jobUrl);
        if (url.protocol !== "https:" || url.username || url.password || !/^[a-zA-Z0-9-]{16,80}$/.test(message.sessionId || "")) throw new Error("A valid HTTPS application URL is required.");
        // Invoke both APIs before any await, while the launch gesture is active.
        const panel = chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
        const permission = chrome.permissions.request({ origins: [`${url.origin}/*`] });
        return (async () => {
            if (!await permission) throw new Error("Allow JobPilot access to this application site to open it with the extension.");
            await panel;
            const previous = await read(originKey(sender.tab.id));
            let tab = previous?.jobUrl === url.href && previous.status === "open"
                ? await chrome.tabs.get(previous.jobTabId).catch(() => null) : null;
            if (tab) await chrome.tabs.update(tab.id, { active: true });
            else tab = await chrome.tabs.create({ url: url.href, active: true, openerTabId: sender.tab.id, windowId: sender.tab.windowId });
            if (previous && previous.jobTabId !== tab.id) await chrome.storage.session.remove(jobKey(previous.jobTabId));
            const session = { sessionId: message.sessionId, originTabId: sender.tab.id, originUrl: sender.url || sender.tab.url,
                jobTabId: tab.id, jobUrl: url.href, windowId: tab.windowId, status: "open",
                formSeen: previous?.jobTabId === tab.id && Boolean(previous.formSeen),
                submitAttempted: previous?.jobTabId === tab.id && Boolean(previous.submitAttempted) };
            await save(session);
            await emit(session);
            await ready(tab.id);
            return { sessionId: session.sessionId, status: session.status, jobUrl: session.jobUrl };
        })();
    };
    const ready = async tabId => {
        const session = await read(jobKey(tabId));
        if (!session || session.status !== "open") return;
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content-script.js", "submission-monitor.js"] }).catch(() => {});
        const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
        await Promise.all((frames || [{ frameId: 0 }]).map(frame => chrome.tabs.sendMessage(tabId,
            { type: "JOBPILOT_TRACK_APPLICATION" }, { frameId: frame.frameId }).catch(() => {})));
        await rescan(session);
    };
    const observed = (message, sender) => serial(sender.tab?.id, async () => {
        const session = await read(jobKey(sender.tab?.id));
        if (!session || session.status !== "open") return {};
        if (message.type === "JOBPILOT_APPLICATION_FORM_SEEN") {
            session.formSeen = true;
            await save(session);
            await rescan(session);
            return {};
        }
        if (message.type === "JOBPILOT_APPLICATION_SUBMIT_ATTEMPT") {
            if (session.formSeen) { session.submitAttempted = true; await save(session); }
            return {};
        }
        if (!session.formSeen || !session.submitAttempted || !message.evidence) return {};
        session.status = "submitted";
        await save(session); // Persist before closing: onRemoved must not overwrite success.
        await returnToApp(session);
        await chrome.tabs.remove(session.jobTabId).catch(() => {});
        await emit(session);
        return { submitted: true };
    });
    const status = async sender => {
        if (!isApp(sender)) return null;
        const session = await read(originKey(sender.tab.id));
        return session && session.originUrl === (sender.url || sender.tab.url)
            ? { sessionId: session.sessionId, status: session.status, jobUrl: session.jobUrl } : null;
    };
    const saved = async (message, sender) => {
        if (!isApp(sender)) throw new Error("Invalid application confirmation source.");
        const session = await read(originKey(sender.tab.id));
        if (!session || session.sessionId !== message.sessionId || session.originUrl !== (sender.url || sender.tab.url)) return {};
        await chrome.storage.session.remove([originKey(session.originTabId), jobKey(session.jobTabId)]);
        // The app only sends this after its authenticated save succeeded.
        await chrome.tabs.remove(session.originTabId);
        return {};
    };
    const removed = tabId => serial(tabId, async () => {
        const session = await read(jobKey(tabId));
        if (session?.status === "open") {
            session.status = "closed";
            await save(session);
            await returnToApp(session);
            await emit(session);
        }
        const origin = await read(originKey(tabId));
        if (origin) await chrome.storage.session.remove([originKey(tabId), jobKey(origin.jobTabId)]);
    });
    return { launch, ready, observed, status, saved, removed };
};
if (typeof module !== "undefined") module.exports = { createApplicationLifecycle };
