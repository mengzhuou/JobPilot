const elements = Object.fromEntries([
    "connectionView", "workspaceView", "mainView", "reviewView", "disconnectButton", "backendUrl",
    "pairingCode", "connectButton", "jobTitle", "jobCompany", "rescanButton", "statusCard",
    "statusTitle", "statusMessage", "summaryView", "readyCount", "reviewCount", "skippedCount",
    "fieldSection", "fieldCount", "fieldList", "actionsView", "fillButton", "aiButton", "toast",
    "reviewBackButton", "aiReviewCount", "aiReviewList", "applyAiButton",
].map(id => [id, document.getElementById(id)]));

const state = {
    connected: false,
    scan: null,
    plan: [],
    results: new Map(),
    aiAnswers: [],
    unresolvedFields: [],
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
const setView = view => {
    show(elements.mainView, view === "main");
    show(elements.reviewView, view === "review");
    document.scrollingElement?.scrollTo({ top: 0, behavior: "smooth" });
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
    const scanned = state.scan?.fields.find(field => field.fieldKey === answer.fieldKey);
    if (scanned?.hasError) return "failed";
    if (answer.aiSuggestion) return answer.action === "fill" && answer.value ? "review" : "skipped";
    if (answer.action === "fill") return "ready";
    if (answer.action === "ask_user") return "review";
    return "skipped";
};
const iconFor = className => ({ filled: "✓", ready: "✓", review: "!", failed: "×", skipped: "–" }[className] || "–");
const statusFor = (answer, className) => {
    const outcome = state.results.get(answer.fieldKey);
    if (outcome?.status === "filled") return "Filled on this page";
    if (outcome?.status === "failed") return outcome.message || "Could not fill this field";
    const scanned = state.scan?.fields.find(field => field.fieldKey === answer.fieldKey);
    if (scanned?.hasError) return scanned.errorMessage || "The application reports this field is invalid; Autofill will retry it.";
    if (answer.aiSuggestion && answer.value) return "AI suggestion ready for your review";
    if (answer.action === "fill") return answer.reason || "Ready from Profile";
    if (answer.action === "ask_user") return answer.reason || "Needs your review";
    return answer.reason || "Skipped";
};
const focusField = async fieldKey => {
    try {
        await send({ type: "JOBPILOT_FOCUS", fieldKey });
    } catch (error) {
        toast(error.message);
    }
};

const combinedAnswers = () => {
    const aiByKey = new Map(state.aiAnswers.map(answer => [answer.fieldKey, answer]));
    return [
        ...state.plan.map(answer => aiByKey.get(answer.fieldKey) || answer),
        ...state.aiAnswers.filter(ai => !state.plan.some(answer => answer.fieldKey === ai.fieldKey)),
    ];
};

const renderFields = () => {
    elements.fieldList.replaceChildren();
    const answers = combinedAnswers();
    answers.forEach(answer => {
        const scanned = state.scan?.fields.find(field => field.fieldKey === answer.fieldKey);
        const className = fieldClass(answer);
        const row = document.createElement("button");
        row.type = "button";
        row.className = `field-row ${className}`;
        row.title = "Show this field on the application page";
        row.addEventListener("click", () => focusField(answer.fieldKey));

        const icon = document.createElement("span");
        icon.className = "field-icon";
        icon.textContent = answer.aiSuggestion && !state.results.has(answer.fieldKey) ? "✦" : iconFor(className);
        const copy = document.createElement("span");
        copy.className = "field-copy";
        const title = document.createElement("strong");
        title.textContent = scanned?.label || answer.fieldKey;
        const status = document.createElement("span");
        status.textContent = statusFor(answer, className);
        copy.append(title, status);

        if (answer.value && answer.action === "fill") {
            const value = document.createElement("span");
            value.className = "field-value";
            value.textContent = answer.sensitive ? "Saved private Profile answer" : answer.value;
            copy.appendChild(value);
        }
        row.append(icon, copy);
        elements.fieldList.appendChild(row);
    });
    elements.fieldCount.textContent = `${answers.length} fields`;
};

const updateAiApplyButton = () => {
    const count = state.aiAnswers.filter(answer => answer.action === "fill" && String(answer.value || "").trim()).length;
    elements.applyAiButton.disabled = count === 0;
    elements.applyAiButton.textContent = count
        ? `Apply ${count} AI suggestion${count === 1 ? "" : "s"}`
        : "No AI suggestions ready";
    elements.aiReviewCount.textContent = `${count} of ${state.aiAnswers.length} answers ready to apply`;
};

const updateAiButton = () => {
    if (state.aiAnswers.length) {
        const ready = state.aiAnswers.filter(answer => answer.action === "fill" && String(answer.value || "").trim()).length;
        elements.aiButton.disabled = false;
        elements.aiButton.textContent = `✦ Review ${ready} AI suggestion${ready === 1 ? "" : "s"}`;
        return;
    }
    elements.aiButton.disabled = state.unresolvedFields.length === 0;
    elements.aiButton.textContent = state.unresolvedFields.length
        ? `✦ Generate AI suggestions for ${state.unresolvedFields.length} field${state.unresolvedFields.length === 1 ? "" : "s"}`
        : "No unresolved fields";
};

const refineAiAnswer = async (index, guidance, button) => {
    const answer = state.aiAnswers[index];
    const field = state.unresolvedFields.find(item => item.fieldKey === answer.fieldKey);
    if (!field) return;
    button.disabled = true;
    button.textContent = "Improving…";
    try {
        const response = await send({
            type: "JOBPILOT_AI_PLAN",
            fields: [field],
            job: state.scan.job,
            guidance: String(guidance || answer.userGuidance || "Make the answer clearer, more natural, and concise."),
            draftAnswers: [{ fieldKey: answer.fieldKey, value: answer.value || "" }],
        });
        const replacement = (response.answers || []).find(item => item.fieldKey === answer.fieldKey);
        if (!replacement?.value || replacement.action !== "fill") {
            state.aiAnswers[index] = { ...answer, reason: replacement?.reason || "AI needs more factual context before it can improve this answer." };
            toast(state.aiAnswers[index].reason);
        } else {
            state.aiAnswers[index] = { ...replacement, aiSuggestion: true, userGuidance: String(guidance || answer.userGuidance || "") };
            toast("Suggestion updated. Review it before applying.");
        }
        renderAiReview();
        renderFields();
        updateAiButton();
    } catch (error) {
        toast(error.message);
    } finally {
        button.disabled = false;
        button.textContent = "Ask AI to improve";
    }
};

function renderAiReview() {
    elements.aiReviewList.replaceChildren();
    state.aiAnswers.forEach((answer, index) => {
        const field = state.unresolvedFields.find(item => item.fieldKey === answer.fieldKey)
            || state.scan?.fields.find(item => item.fieldKey === answer.fieldKey);
        const card = document.createElement("article");
        card.className = "ai-answer-card";

        const questionButton = document.createElement("button");
        questionButton.type = "button";
        questionButton.className = "ai-question-button";
        const number = document.createElement("span");
        number.textContent = `Question ${index + 1}`;
        const question = document.createElement("strong");
        question.textContent = field?.label || answer.fieldKey;
        const jump = document.createElement("small");
        jump.textContent = "Show on application ↗";
        questionButton.append(number, question, jump);
        questionButton.addEventListener("click", () => focusField(answer.fieldKey));

        const answerLabel = document.createElement("label");
        answerLabel.textContent = "Suggested answer";
        const textarea = document.createElement("textarea");
        textarea.rows = 5;
        textarea.maxLength = 1200;
        textarea.value = answer.value || "";
        textarea.placeholder = "AI could not answer from your saved information. Add factual context below, or write the answer here.";
        textarea.addEventListener("input", event => {
            const value = event.target.value;
            state.aiAnswers[index] = {
                ...state.aiAnswers[index],
                value,
                action: value.trim() ? "fill" : "ask_user",
                source: "User-reviewed AI suggestion",
            };
            updateAiApplyButton();
            updateAiButton();
            renderFields();
        });

        const reason = document.createElement("p");
        reason.className = "answer-reason";
        reason.textContent = [
            answer.reason || "Generated from your saved candidate context.",
            answer.source ? `Based on: ${answer.source}.` : "",
        ].filter(Boolean).join(" ");

        const promptLabel = document.createElement("label");
        promptLabel.textContent = answer.followUpQuestion || "Ask AI for a better response";
        const promptRow = document.createElement("div");
        promptRow.className = "prompt-row";
        const prompt = document.createElement("input");
        prompt.type = "text";
        prompt.maxLength = 1000;
        prompt.value = answer.userGuidance || "";
        prompt.placeholder = answer.value
            ? "Make it shorter, warmer, or add factual context…"
            : "Describe the project, situation, what you did, and the result…";
        prompt.addEventListener("input", event => {
            state.aiAnswers[index] = { ...state.aiAnswers[index], userGuidance: event.target.value };
        });
        const improveButton = document.createElement("button");
        improveButton.type = "button";
        improveButton.className = "secondary-button compact";
        improveButton.textContent = "Ask AI to improve";
        improveButton.addEventListener("click", () => refineAiAnswer(index, prompt.value, improveButton));
        prompt.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                improveButton.click();
            }
        });
        promptRow.append(prompt, improveButton);
        card.append(questionButton, answerLabel, textarea, reason, promptLabel, promptRow);
        elements.aiReviewList.appendChild(card);
    });
    updateAiApplyButton();
}

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
    updateAiButton();
    renderFields();
};

let scanGeneration = 0;
const scanAndPlan = async () => {
    const generation = ++scanGeneration;
    state.results.clear();
    state.aiAnswers = [];
    state.unresolvedFields = [];
    setView("main");
    show(elements.summaryView, false);
    show(elements.fieldSection, false);
    show(elements.actionsView, false);
    setStatus("Inspecting this application", "Looking for fields JobPilot can safely complete.");
    try {
        const scan = await send({ type: "JOBPILOT_SCAN" });
        if (generation !== scanGeneration) return;
        state.scan = scan;
        elements.jobTitle.textContent = state.scan.job?.title || "Application page";
        elements.jobCompany.textContent = state.scan.job?.company || new URL(state.scan.job?.url || "https://example.com").hostname;
        if (state.scan.unavailable) throw new Error("This application page appears to be unavailable.");
        if (!state.scan.fields.length) throw new Error("No visible application fields were found on this page.");

        const plan = await send({ type: "JOBPILOT_BUILD_PLAN", fields: state.scan.fields });
        if (generation !== scanGeneration) return;
        const pendingFileFields = state.scan.fields.filter(field => field.type === "file" && !field.filled);
        const clearlyResumeFields = pendingFileFields.filter(field => /\b(resume|résumé|curriculum vitae|cv)\b/i.test(
            `${field.label || ""} ${field.name || ""} ${field.context || ""}`
        ));
        const resumeFieldKeys = new Set((clearlyResumeFields.length
            ? clearlyResumeFields
            : pendingFileFields.length === 1 && !/cover letter/i.test(`${pendingFileFields[0].label || ""} ${pendingFileFields[0].name || ""} ${pendingFileFields[0].context || ""}`)
                ? pendingFileFields
                : []).map(field => field.fieldKey));
        state.plan = (plan.answers || []).map(answer => {
            const field = state.scan.fields.find(item => item.fieldKey === answer.fieldKey);
            if (resumeFieldKeys.has(field?.fieldKey)) {
                return {
                    ...answer,
                    action: "fill",
                    value: "Primary résumé",
                    source: "JobPilot · Primary résumé",
                    reason: "Your primary résumé will be attached automatically.",
                    resumeAttachment: true,
                };
            }
            return answer;
        });
        state.unresolvedFields = state.scan.fields.filter(field => state.plan.find(answer => answer.fieldKey === field.fieldKey)?.action === "ask_user");
        renderPlan();
        const ready = state.plan.filter(answer => answer.action === "fill").length;
        setStatus(
            "Review before filling",
            `${ready} fields can be filled from your Profile and primary résumé. Click any field to locate it on the application.`,
            "success"
        );
        if (plan.missingProfileFields?.length) toast(`Profile could be stronger: ${plan.missingProfileFields.join(", ")}.`);
    } catch (error) {
        if (generation !== scanGeneration) return;
        state.plan = [];
        setStatus("JobPilot needs your attention", error.message, "error");
    }
};

const applyAnswers = async answers => {
    if (!answers.length) return false;
    setStatus("Autofilling your application", "Keep this tab open while JobPilot applies the answers you reviewed.");
    elements.fillButton.disabled = true;
    elements.aiButton.disabled = true;
    elements.applyAiButton.disabled = true;
    try {
        const resumeAnswers = state.plan.filter(answer => answer.resumeAttachment && answer.action === "fill");
        const response = await send({
            type: "JOBPILOT_APPLY",
            answers: answers.filter(answer => !answer.resumeAttachment),
            fileFields: resumeAnswers.map(answer => ({ fieldKey: answer.fieldKey })),
        });
        (response.results || []).forEach(result => state.results.set(result.fieldKey, result));
        renderFields();
        const filled = response.results.filter(result => result.status === "filled").length;
        const failed = response.results.filter(result => result.status === "failed").length;
        setStatus(
            filled ? "Autofill complete" : "No fields were changed",
            failed ? `${filled} filled and ${failed} need manual review.` : `${filled} fields filled. Review the application before submitting.`,
            filled ? "success" : "error"
        );
        await new Promise(resolve => window.setTimeout(resolve, 250));
        await scanAndPlan();
        return filled > 0;
    } catch (error) {
        setStatus("Autofill stopped", error.message, "error");
        return false;
    } finally {
        elements.fillButton.disabled = false;
        elements.aiButton.disabled = false;
        updateAiApplyButton();
    }
};

const generateAiSuggestions = async () => {
    if (!state.unresolvedFields.length) return;
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "Generating suggestions…";
    setStatus("AI is drafting answers", "Nothing will be entered until you review and apply the suggestions.");
    try {
        const response = await send({ type: "JOBPILOT_AI_PLAN", fields: state.unresolvedFields, job: state.scan.job });
        const byKey = new Map((response.answers || []).map(answer => [answer.fieldKey, answer]));
        state.aiAnswers = state.unresolvedFields.map(field => ({
            ...(byKey.get(field.fieldKey) || {
                fieldKey: field.fieldKey,
                action: "ask_user",
                value: "",
                reason: "AI needs more factual context before it can suggest an answer.",
                source: "AI review",
            }),
            aiSuggestion: true,
        }));
        renderAiReview();
        renderFields();
        updateAiButton();
        setView("review");
    } catch (error) {
        setStatus("AI suggestions unavailable", error.message, "error");
    } finally {
        updateAiButton();
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
let launchScanTimer;
chrome.runtime.onMessage.addListener(message => {
    if (message.type !== "JOBPILOT_RESCAN_REQUEST") return;
    window.clearTimeout(launchScanTimer);
    launchScanTimer = window.setTimeout(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (state.connected && tab?.id === message.tabId && tab.windowId === message.windowId) await scanAndPlan();
    }, 150);
});
elements.reviewBackButton.addEventListener("click", () => setView("main"));
elements.fillButton.addEventListener("click", () => applyAnswers(state.plan.filter(answer => answer.action === "fill")));
elements.aiButton.addEventListener("click", () => {
    if (state.aiAnswers.length) {
        renderAiReview();
        setView("review");
        return;
    }
    generateAiSuggestions();
});
elements.applyAiButton.addEventListener("click", async () => {
    const answers = state.aiAnswers.filter(answer => answer.action === "fill" && String(answer.value || "").trim());
    const memories = answers.map(answer => ({
        question: state.unresolvedFields.find(field => field.fieldKey === answer.fieldKey)?.label || answer.fieldKey,
        userContext: answer.userGuidance || "",
        acceptedAnswer: answer.value,
    }));
    try {
        await send({ type: "JOBPILOT_SAVE_ANSWER_MEMORY", memories, job: state.scan.job });
    } catch (error) {
        toast(`Answers can still be applied, but JobPilot could not save them for reuse: ${error.message}`);
    }
    const applied = await applyAnswers(answers);
    if (applied) setView("main");
});

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
