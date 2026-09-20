(() => {
    const submissionEvidence = ({ url, messages, hasApplicationForm }) => {
        if (hasApplicationForm) return "";
        const explicit = /^(?:thank you for (?:applying|your (?:interest and )?application)|(?:your )?application (?:has been |was )?(?:successfully )?(?:submitted|received)|we(?:'ve| have) (?:successfully )?received your application)\b/i;
        const confirmationUrl = /\/(?:confirmation|application[-_]submitted|application[-_]confirmation|thanks|thank-you)(?:\/|\?|$)/i.test(url);
        return messages.find(text => text.length < 400 && (explicit.test(text) || (confirmationUrl && /^thank you[!.]?$/i.test(text)))) || "";
    };
    if (typeof module !== "undefined") module.exports = { submissionEvidence };
    if (typeof window === "undefined" || window.__JOBPILOT_SUBMISSION_MONITOR__) return;
    window.__JOBPILOT_SUBMISSION_MONITOR__ = true;
    let tracked = false, sent = false, formSeen = false, timer;
    const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
    const notify = message => chrome.runtime.sendMessage(message).catch(() => {});
    const attempted = async () => {
        if (!tracked || sent) return;
        // Send immediately for an already observed form, before a native submit
        // can unload this document. Only discovery needs an asynchronous scan.
        if (!formSeen) await check();
        if (formSeen) await notify({ type: "JOBPILOT_APPLICATION_SUBMIT_ATTEMPT" });
    };
    const check = async () => {
        if (!tracked || sent) return;
        const hasApplicationForm = Array.from(document.querySelectorAll("input[id='first_name'], input[name*='first_name'], input[autocomplete='given-name'], input[type='file'], textarea, [role='combobox']")).some(visible);
        if (hasApplicationForm && !formSeen) {
            formSeen = true;
            await notify({ type: "JOBPILOT_APPLICATION_FORM_SEEN" });
        }
        const messages = Array.from(document.querySelectorAll("h1, h2, [role='status'], [role='alert'], #application_confirmation, .application-confirmation"))
            .filter(visible).map(node => (node.innerText || "").replace(/\s+/g, " ").trim());
        const evidence = submissionEvidence({ url: location.href, messages, hasApplicationForm });
        if (evidence) {
            const response = await notify({ type: "JOBPILOT_APPLICATION_SUBMITTED", evidence });
            if (response?.ok && response.data?.submitted) sent = true;
        }
    };
    chrome.runtime.onMessage.addListener(message => {
        if (message.type === "JOBPILOT_TRACK_APPLICATION") { tracked = true; check(); }
    });
    document.addEventListener("submit", attempted, true);
    document.addEventListener("click", event => {
        const button = event.target.closest?.("button, input[type='submit'], [role='button']");
        if (event.isTrusted && button && (button.type === "submit" || /\b(submit|send)\s+(?:my\s+)?application\b/i.test(button.innerText || button.value || ""))) attempted();
    }, true);
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 200); })
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
})();
