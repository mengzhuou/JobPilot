const elements = Object.fromEntries([
    "connectionView", "workspaceView", "disconnectButton", "backendUrl", "pairingCode", "connectButton",
    "jobTitle", "jobCompany", "rescanButton", "statusCard", "statusTitle", "statusMessage", "summaryView",
    "readyCount", "reviewCount", "skippedCount", "fieldSection", "fieldCount", "fieldList", "actionsView",
    "fillButton", "aiButton", "applyAiButton", "toast",
].map(id => [id, document.getElementById(id)]));

const state = {
    connected: false,
    scan: null,
    plan: [],
    results: new Map(),
    aiAnswers: [],
    selectedAi: new Set(),
};

const send = message => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || "JobPilot extension did not respond."));
        resolve(response.data);
    });
});
const show = (element, visible = true) => element.classList.toggle("hidden", !visible);
const toast = message => {
    elements.toast.textContent = message;
    show(elements.toast, true);
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => show(elements.toast, false), 4200);
};
const setStatus = (title, message, mode = "loading") => {
    show(elements.statusCard, true);
    elements.statusTitle.textContent = title;
    elements.statusMessage.textContent = message;
    elements.statusCard.classList.toggle("error", mode === "error");
    elements.statusCard.classList.toggle("success", mode === "success");
};
const formatCode = value => {
    const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
};
const requestBackendPermission = async backendUrl => {
    const url = new URL(backendUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Use an HTTP or HTTPS JobPilot server URL.");
    const origin = `${url.origin}/*`;
    const hasPermission = await chrome.permissions.contains({ origins: [origin] });
    if (!hasPermission) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) throw new Error("Chrome needs permission to connect to this JobPilot server.");
    }
};

const renderConnection = () => {
    show(elements.connectionView, !state.connected);
    show(elements.workspaceView, state.connected);
    show(elements.disconnectButton, state.connected);
};

const fieldClass = answer => {
    const outcome = state.results.get(answer.fieldKey);
    if (outcome?.status === "filled") return "filled";
    if (outcome?.status === "failed") return "failed";
    if (answer.action === "fill") return "ready";
    if (answer.action === "ask_user") return "review";
    return "skipped";
};
const iconFor = className => ({ filled: "✓", ready: "✓", review: "!", failed: "×", skipped: "–" }[className] || "–");
const statusFor = (answer, className) => {
    const outcome = state.results.get(answer.fieldKey);
    if (outcome?.status === "filled") return "Filled on this page";
    if (outcome?.status === "failed") return outcome.message || "Could not fill this field";
    if (answer.action === "fill") return answer.reason || "Ready from Profile";
    if (answer.action === "ask_user") return answer.reason || "Needs your review";
    return answer.reason || "Skipped";
};

const renderFields = () => {
    elements.fieldList.replaceChildren();
    const aiByKey = new Map(state.aiAnswers.map(answer => [answer.fieldKey, answer]));
    const answers = [
        ...state.plan.map(answer => aiByKey.get(answer.fieldKey) || answer),
        ...state.aiAnswers.filter(ai => !state.plan.some(answer => answer.fieldKey === ai.fieldKey)),
    ];
    answers.forEach(answer => {
        const scanned = state.scan?.fields.find(field => field.fieldKey === answer.fieldKey);
        const className = answer.aiSuggestion && !state.results.has(answer.fieldKey) ? "review" : fieldClass(answer);
        const row = document.createElement("div");
        row.className = `field-row ${className}`;

        const icon = document.createElement("span");
        icon.className = "field-icon";
        icon.textContent = answer.aiSuggestion ? "✦" : iconFor(className);
        const copy = document.createElement("div");
        copy.className = "field-copy";
        const title = document.createElement("strong");
        title.textContent = scanned?.label || answer.fieldKey;
        const status = document.createElement("span");
        status.textContent = answer.aiSuggestion && !state.results.has(answer.fieldKey)
            ? answer.reason || "AI suggestion—review before applying"
            : statusFor(answer, className);
        copy.append(title, status);

        if (answer.value && answer.action === "fill") {
            const value = document.createElement("span");
            value.className = "field-value";
            value.textContent = answer.sensitive ? "Saved private Profile answer" : answer.value;
            copy.appendChild(value);
        }
        if (answer.aiSuggestion && answer.action === "fill") {
            const review = document.createElement("label");
            review.className = "ai-review";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = state.selectedAi.has(answer.fieldKey);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) state.selectedAi.add(answer.fieldKey);
                else state.selectedAi.delete(answer.fieldKey);
                elements.applyAiButton.disabled = state.selectedAi.size === 0;
            });
            const label = document.createElement("span");
            label.textContent = "I reviewed this answer and want JobPilot to fill it.";
            review.append(checkbox, label);
            copy.appendChild(review);
        }
        row.append(icon, copy);
        elements.fieldList.appendChild(row);
    });
    elements.fieldCount.textContent = `${answers.length} fields`;
};

const renderPlan = summary => {
    const calculated = summary || {
        ready: state.plan.filter(answer => answer.action === "fill").length,
        needsReview: state.plan.filter(answer => answer.action === "ask_user").length,
        skipped: state.plan.filter(answer => answer.action === "skip").length,
    };
    elements.readyCount.textContent = calculated.ready;
    elements.reviewCount.textContent = calculated.needsReview;
    elements.skippedCount.textContent = calculated.skipped;
    show(elements.summaryView, true);
    show(elements.fieldSection, true);
    show(elements.actionsView, true);
    elements.fillButton.disabled = calculated.ready === 0;
    elements.fillButton.textContent = calculated.ready ? `Fill ${calculated.ready} ready field${calculated.ready === 1 ? "" : "s"}` : "No Profile fields ready";
    elements.aiButton.disabled = calculated.needsReview === 0;
    elements.aiButton.textContent = calculated.needsReview ? `✦ Use AI for ${calculated.needsReview} unresolved field${calculated.needsReview === 1 ? "" : "s"}` : "No unresolved fields";
    show(elements.applyAiButton, state.aiAnswers.length > 0);
    renderFields();
};

const scanAndPlan = async () => {
    state.results.clear();
    state.aiAnswers = [];
    state.selectedAi.clear();
    show(elements.summaryView, false);
    show(elements.fieldSection, false);
    show(elements.actionsView, false);
    setStatus("Inspecting this application", "Looking for fields JobPilot can safely complete.");
    try {
        state.scan = await send({ type: "JOBPILOT_SCAN" });
        elements.jobTitle.textContent = state.scan.job?.title || "Application page";
        elements.jobCompany.textContent = state.scan.job?.company || new URL(state.scan.job?.url || "https://example.com").hostname;
        if (state.scan.unavailable) throw new Error("This application page appears to be unavailable.");
        if (!state.scan.fields.length) throw new Error("No visible application fields were found on this page.");

        const plan = await send({ type: "JOBPILOT_BUILD_PLAN", fields: state.scan.fields });
        state.plan = plan.answers || [];
        renderPlan(plan.summary);
        setStatus(
            "Review before filling",
            `${plan.summary.ready} fields can be filled from your Profile. JobPilot will skip fields that already contain data.`,
            "success"
        );
        if (plan.missingProfileFields?.length) toast(`Profile could be stronger: ${plan.missingProfileFields.join(", ")}.`);
    } catch (error) {
        state.plan = [];
        setStatus("JobPilot needs your attention", error.message, "error");
    }
};

const applyAnswers = async answers => {
    if (!answers.length) return;
    setStatus("Autofilling your application", "Keep this tab open while JobPilot applies the answers you reviewed.");
    elements.fillButton.disabled = true;
    elements.aiButton.disabled = true;
    elements.applyAiButton.disabled = true;
    try {
        const response = await send({ type: "JOBPILOT_APPLY", answers });
        (response.results || []).forEach(result => state.results.set(result.fieldKey, result));
        renderFields();
        const filled = response.results.filter(result => result.status === "filled").length;
        const failed = response.results.filter(result => result.status === "failed").length;
        setStatus(
            filled ? "Autofill complete" : "No fields were changed",
            failed ? `${filled} filled and ${failed} need manual review.` : `${filled} fields filled. Review the application before submitting.`,
            filled ? "success" : "error"
        );
    } catch (error) {
        setStatus("Autofill stopped", error.message, "error");
    } finally {
        elements.fillButton.disabled = false;
        elements.aiButton.disabled = false;
        elements.applyAiButton.disabled = state.selectedAi.size === 0;
    }
};

elements.pairingCode.addEventListener("input", event => { event.target.value = formatCode(event.target.value); });
elements.connectButton.addEventListener("click", async () => {
    elements.connectButton.disabled = true;
    elements.connectButton.textContent = "Connecting…";
    try {
        const backendUrl = elements.backendUrl.value.trim().replace(/\/$/, "");
        const code = formatCode(elements.pairingCode.value);
        if (code.length !== 9) throw new Error("Enter the eight-character pairing code from your JobPilot Profile.");
        await requestBackendPermission(backendUrl);
        await send({ type: "JOBPILOT_PAIR", backendUrl, code });
        state.connected = true;
        renderConnection();
        await scanAndPlan();
    } catch (error) {
        toast(error.message);
    } finally {
        elements.connectButton.disabled = false;
        elements.connectButton.textContent = "Connect JobPilot";
    }
});
elements.disconnectButton.addEventListener("click", async () => {
    await send({ type: "JOBPILOT_DISCONNECT" }).catch(() => {});
    state.connected = false;
    renderConnection();
    toast("This Chrome extension is disconnected from JobPilot.");
});
elements.rescanButton.addEventListener("click", scanAndPlan);
elements.fillButton.addEventListener("click", () => applyAnswers(state.plan.filter(answer => answer.action === "fill")));
elements.aiButton.addEventListener("click", async () => {
    const unresolved = state.scan?.fields.filter(field => state.plan.find(answer => answer.fieldKey === field.fieldKey)?.action === "ask_user") || [];
    if (!unresolved.length) return;
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "Generating suggestions…";
    setStatus("AI is drafting answers", "Nothing will be filled until you review and select each suggestion.");
    try {
        const response = await send({ type: "JOBPILOT_AI_PLAN", fields: unresolved, job: state.scan.job });
        state.aiAnswers = (response.answers || []).map(answer => ({ ...answer, aiSuggestion: true }));
        state.selectedAi.clear();
        show(elements.applyAiButton, true);
        elements.applyAiButton.disabled = true;
        renderFields();
        setStatus("Review AI suggestions", "Select only answers that accurately represent you, then apply them.", "success");
    } catch (error) {
        setStatus("AI suggestions unavailable", error.message, "error");
    } finally {
        elements.aiButton.disabled = false;
        elements.aiButton.textContent = "✦ Regenerate AI suggestions";
    }
});
elements.applyAiButton.addEventListener("click", () => applyAnswers(
    state.aiAnswers.filter(answer => answer.action === "fill" && state.selectedAi.has(answer.fieldKey))
));

(async () => {
    try {
        const connection = await send({ type: "JOBPILOT_GET_CONNECTION" });
        state.connected = connection.connected;
        elements.backendUrl.value = connection.backendUrl || "http://localhost:3500";
        renderConnection();
        if (state.connected) await scanAndPlan();
    } catch (error) {
        toast(error.message);
    }
})();
