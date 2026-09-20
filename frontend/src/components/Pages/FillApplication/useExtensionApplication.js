import { useCallback, useEffect, useRef, useState } from "react";
import { confirmJobApplication } from "../../../connector";

// Keep the job attached to a launch even if the editable URL changes afterwards.
export default function useExtensionApplication(payload) {
    const storageKey = `jobpilot.extension.launch:${window.location.pathname}${window.location.search}`;
    const launch = useRef(null);
    const busy = useRef(false);
    const attemptedAutoSave = useRef(new Set());
    const [status, setStatus] = useState("idle");
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState("");
    const persist = useCallback(record => {
        launch.current = record;
        if (record) sessionStorage.setItem(storageKey, JSON.stringify(record));
        else sessionStorage.removeItem(storageKey);
    }, [storageKey]);
    const confirmApplied = useCallback(async () => {
        const record = launch.current;
        if (!record || busy.current || record.saved) return;
        busy.current = true;
        setIsConfirming(true);
        setError("");
        try {
            await confirmJobApplication(record.payload);
            localStorage.setItem("jobpilot.application.confirmed", JSON.stringify({
                externalJobId: record.payload.externalJobId, jobUrl: record.payload.jobUrl, confirmedAt: Date.now(),
            }));
            persist({ ...record, saved: true });
            setStatus("applied");
            setShowConfirmation(false);
            // Only close after the authenticated application save succeeds.
            window.postMessage({ source: "jobpilot-app", type: "saved", sessionId: record.sessionId }, window.location.origin);
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to save this application. Please retry Yes, I applied.");
            setShowConfirmation(true);
        } finally {
            busy.current = false;
            setIsConfirming(false);
        }
    }, [persist]);

    useEffect(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey));
            if (saved) { launch.current = saved; setStatus(saved.saved ? "applied" : "extension"); setShowConfirmation(!saved.saved); }
        } catch { sessionStorage.removeItem(storageKey); }
        let autoTimer;
        const receive = event => {
            if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "jobpilot-extension") return;
            const message = event.data;
            const record = launch.current;
            if (!record || message.sessionId !== record.sessionId) return;
            if (message.type === "launch-error") { setError(message.error); setStatus("error"); return; }
            if (message.type !== "launch-state" || message.jobUrl !== record.payload.jobUrl) return;
            if (record.status === "submitted" && message.status !== "submitted") return;
            if (record.saved) {
                window.postMessage({ source: "jobpilot-app", type: "saved", sessionId: record.sessionId }, window.location.origin);
                return;
            }
            persist({ ...record, status: message.status });
            setStatus(message.status === "open" ? "extension" : message.status);
            if (message.status === "closed" && record.status !== "closed") setShowConfirmation(true);
            if (message.status === "submitted" && !attemptedAutoSave.current.has(record.sessionId)) {
                attemptedAutoSave.current.add(record.sessionId);
                setShowConfirmation(true);
                autoTimer = window.setTimeout(confirmApplied, 300);
            }
        };
        const sync = () => window.postMessage({ source: "jobpilot-app", type: "get-launch" }, window.location.origin);
        window.addEventListener("message", receive);
        window.addEventListener("focus", sync);
        sync();
        return () => { window.removeEventListener("message", receive); window.removeEventListener("focus", sync); window.clearTimeout(autoTimer); };
    }, [confirmApplied, persist, storageKey]);

    const openWithExtension = () => {
        setError("");
        if (document.documentElement.dataset.jobpilotExtension !== "ready") {
            setError("Install or reload JobPilot Autofill, then refresh this page to connect the extension.");
            return;
        }
        let jobUrl;
        try { jobUrl = new URL(payload.jobUrl.trim()); if (jobUrl.protocol !== "https:") throw new Error(); }
        catch { setError("Enter a valid HTTPS application URL."); return; }
        if (busy.current) return;
        const sessionId = window.crypto.randomUUID();
        persist({ sessionId, status: "open", payload: { ...payload, jobUrl: jobUrl.href } });
        setStatus("extension");
        // Always present, whether or not the candidate ultimately submits.
        setShowConfirmation(true);
        window.dispatchEvent(new CustomEvent("jobpilot:launch", { detail: { sessionId, jobUrl: jobUrl.href } }));
    };
    return { status, showConfirmation, setShowConfirmation, isConfirming, error, openWithExtension, confirmApplied };
}
