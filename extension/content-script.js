(() => {
    if (window.__JOBPILOT_CONTENT_SCRIPT__) return;
    window.__JOBPILOT_CONTENT_SCRIPT__ = true;

    const registry = new Map();
    const MAX_FIELDS = 120;
    const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();
    const normalized = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const visible = element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0
            && rect.width > 0 && rect.height > 0;
    };
    const textById = ids => cleanText(String(ids || "").split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" "));
    const nearestText = element => {
        const candidates = [];
        if (element.labels) candidates.push(...Array.from(element.labels).map(label => label.innerText));
        candidates.push(
            element.getAttribute("aria-label"),
            textById(element.getAttribute("aria-labelledby")),
            element.closest("label")?.innerText,
            element.previousElementSibling?.matches?.("label") ? element.previousElementSibling.innerText : "",
            element.parentElement?.querySelector?.(":scope > label")?.innerText,
            element.closest("[data-automation-id*='formField'], .field, .form-field, .application-question, [class*='field']")?.querySelector?.("label, legend, [class*='label']")?.innerText
        );
        return candidates.map(cleanText).filter(text => text && text.length <= 500).sort((a, b) => a.length - b.length)[0]
            || cleanText(element.placeholder)
            || cleanText(element.name)
            || "Unlabeled field";
    };
    const optionLabel = element => element ? cleanText(
        element.labels?.[0]?.innerText
        || element.closest("label")?.innerText
        || element.parentElement?.innerText
        || element.value
    ).slice(0, 300) : "";
    const fileContext = element => {
        let node = element.parentElement;
        for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
            const text = cleanText(node.innerText).slice(0, 500);
            if (/\b(resume|résumé|curriculum vitae|cv|cover letter)\b/i.test(text)) return text;
        }
        return "";
    };
    const stableKey = (element, index) => {
        if (element.dataset.jobpilotFieldId) return element.dataset.jobpilotFieldId;
        const seed = cleanText(element.id || element.name || element.getAttribute("aria-label") || element.placeholder || `field-${index}`)
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .slice(0, 90) || `field-${index}`;
        let key = seed;
        let suffix = 1;
        while (registry.has(key) && registry.get(key)?.element !== element) key = `${seed}-${suffix++}`;
        element.dataset.jobpilotFieldId = key;
        return key;
    };
    const selectedRadioValue = elements => optionLabel(elements.find(element => element.checked) || null);
    const isFilled = (type, element, elements = []) => {
        if (type === "radio") return elements.some(item => item.checked);
        if (type === "checkbox") return Boolean(element.checked);
        if (type === "file") return Boolean(element.files?.length);
        if (type === "select" || type === "combobox") {
            const value = cleanText(element.value || element.textContent);
            return Boolean(value && !/^(select|choose|please select|--)/i.test(value));
        }
        return Boolean(cleanText(element.value || element.textContent));
    };
    const typeFor = element => {
        if (element.matches("select")) return "select";
        if (element.getAttribute("role") === "combobox") return "combobox";
        if (element.matches("textarea")) return "textarea";
        if (element.isContentEditable) return "textarea";
        return String(element.type || "text").toLowerCase();
    };

    const scanFields = () => {
        registry.clear();
        const elements = Array.from(document.querySelectorAll(
            "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='combobox']"
        )).filter(element => !element.disabled && (visible(element) || typeFor(element) === "file")).slice(0, MAX_FIELDS * 2);
        const handledRadioNames = new Set();
        const fields = [];

        elements.forEach((element, index) => {
            if (fields.length >= MAX_FIELDS) return;
            const type = typeFor(element);
            if (["submit", "button", "reset", "image"].includes(type)) return;
            if (type === "radio" && element.name) {
                if (handledRadioNames.has(element.name)) return;
                handledRadioNames.add(element.name);
                const group = elements.filter(item => typeFor(item) === "radio" && item.name === element.name);
                const key = stableKey(element, index);
                registry.set(key, { type, element, elements: group });
                fields.push({
                    fieldKey: key,
                    label: nearestText(element),
                    placeholder: "",
                    autocomplete: cleanText(element.autocomplete),
                    name: cleanText(element.name),
                    type,
                    required: group.some(item => item.required || item.getAttribute("aria-required") === "true"),
                    filled: isFilled(type, element, group),
                    currentValue: selectedRadioValue(group),
                    options: group.map(optionLabel).filter(Boolean),
                });
                return;
            }
            const key = stableKey(element, index);
            const options = type === "select"
                ? Array.from(element.options).map(option => cleanText(option.textContent)).filter(Boolean)
                : [];
            registry.set(key, { type, element, elements: [element] });
            fields.push({
                fieldKey: key,
                label: nearestText(element),
                placeholder: cleanText(element.placeholder),
                autocomplete: cleanText(element.autocomplete),
                name: cleanText(element.name),
                type,
                context: type === "file" ? fileContext(element) : "",
                required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
                filled: isFilled(type, element),
                currentValue: type === "checkbox"
                    ? (element.checked ? optionLabel(element) || "Yes" : "")
                    : type === "file"
                        ? Array.from(element.files || []).map(file => file.name).join(", ")
                        : cleanText(element.value || element.textContent),
                options,
            });
        });
        return fields;
    };

    const pageUnavailable = () => {
        const title = normalized(document.title);
        const heading = normalized(Array.from(document.querySelectorAll("h1, h2")).slice(0, 5).map(node => node.innerText).join(" "));
        const text = `${title} ${heading}`;
        return /\b(page not found|job not found|position (?:is )?no longer available|job (?:is )?no longer available|404 not found)\b/.test(text);
    };

    const jobMetadata = () => ({
        url: window.top === window ? window.location.href : document.referrer,
        title: cleanText(document.querySelector("h1")?.innerText || document.title).slice(0, 300),
        company: cleanText(document.querySelector("[data-testid*='company'], [class*='company'], meta[property='og:site_name']")?.content
            || document.querySelector("[data-testid*='company'], [class*='company']")?.innerText).slice(0, 300),
        summary: cleanText(document.querySelector("main")?.innerText || document.body?.innerText).slice(0, 6000),
    });

    const setNativeValue = (element, value, { commit = true } = {}) => {
        if (element.isContentEditable) {
            element.textContent = value;
        } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
            if (setter) setter.call(element, value);
            else element.value = value;
        } else {
            return;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        if (commit) {
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));
        }
    };
    const semanticMatch = (available, desired) => {
        const target = normalized(desired)
            .replace(/\b(i am|im|a|an|the)\b/g, " ")
            .replace(/\s+/g, " ").trim();
        return available.find(value => {
            const option = normalized(value).replace(/\b(i am|im|a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
            if (!option || !target) return false;
            const targetNegative = /\b(no|not|never|without|decline)\b/.test(target);
            const optionNegative = /\b(no|not|never|without|decline)\b/.test(option);
            return targetNegative === optionNegative && (option === target || option.includes(target) || target.includes(option));
        });
    };
    const clickReactAware = element => {
        element.focus({ preventScroll: true });
        element.click();
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    const visibleAutocompleteOptions = () => Array.from(document.querySelectorAll(
        "[role='listbox'] [role='option']:not([aria-disabled='true']), [role='option']:not([aria-disabled='true']), [data-testid*='option'], [id*='option-']"
    )).filter(option => visible(option) && cleanText(option.innerText || option.textContent));
    const waitForAutocompleteOptions = async (timeout = 2500) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            const options = visibleAutocompleteOptions();
            if (options.length) return options;
            await wait(100);
        }
        return [];
    };
    const typeAndSelectAutocomplete = async (element, value) => {
        element.focus({ preventScroll: true });
        element.click();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable) {
            setNativeValue(element, "", { commit: false });
            setNativeValue(element, value, { commit: false });
        }
        const options = await waitForAutocompleteOptions();
        const labels = options.map(option => cleanText(option.innerText || option.textContent));
        const match = semanticMatch(labels, value)
            || labels.find(label => normalized(label).startsWith(normalized(value)));
        const index = labels.indexOf(match);
        if (index < 0) return false;
        clickReactAware(options[index]);
        await wait(120);
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
    };

    const focusEntry = fieldKey => {
        const entry = registry.get(fieldKey);
        if (!entry?.element?.isConnected) throw new Error("This field moved. Rescan the application and try again.");
        const element = entry.element;
        const target = element.closest(
            "[data-automation-id*='formField'], .field, .form-field, .application-question, [class*='field'], label"
        ) || element;
        if (!document.getElementById("jobpilot-field-focus-style")) {
            const style = document.createElement("style");
            style.id = "jobpilot-field-focus-style";
            style.textContent = `.jobpilot-field-focus{outline:3px solid #3a70c3!important;outline-offset:6px!important;border-radius:6px!important;transition:outline-color .2s ease!important}`;
            document.documentElement.appendChild(style);
        }
        document.querySelectorAll(".jobpilot-field-focus").forEach(node => node.classList.remove("jobpilot-field-focus"));
        target.classList.add("jobpilot-field-focus");
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        window.setTimeout(() => element.focus({ preventScroll: true }), 350);
        window.setTimeout(() => target.classList.remove("jobpilot-field-focus"), 2600);
        return { focused: true };
    };

    const fillEntry = async (entry, answer) => {
        const { element, elements, type } = entry;
        if (!element?.isConnected) return { status: "failed", message: "The field is no longer on the page." };
        if (isFilled(type, element, elements)) return { status: "skipped", message: "Already filled." };
        const value = cleanText(answer.value);

        if (type === "checkbox") {
            if (!element.checked && /^(true|yes|acknowledge|acknowledge confirm)$/i.test(normalized(value))) clickReactAware(element);
            return element.checked ? { status: "filled" } : { status: "failed", message: "The checkbox could not be selected." };
        }
        if (type === "radio") {
            const labels = elements.map(optionLabel);
            const match = semanticMatch(labels, value);
            const index = labels.indexOf(match);
            if (index < 0) return { status: "failed", message: "No equivalent radio option was found." };
            clickReactAware(elements[index]);
            return { status: elements[index].checked ? "filled" : "failed" };
        }
        if (type === "select") {
            const labels = Array.from(element.options).map(option => cleanText(option.textContent));
            const match = semanticMatch(labels, value);
            const index = labels.indexOf(match);
            if (index < 0) return { status: "failed", message: "No equivalent dropdown option was found." };
            element.selectedIndex = index;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));
            return { status: cleanText(element.value) ? "filled" : "failed" };
        }
        if (type === "combobox") {
            const selected = await typeAndSelectAutocomplete(element, value);
            return selected
                ? { status: "filled" }
                : { status: "failed", message: "No equivalent autocomplete option was found." };
        }

        if (element.getAttribute("aria-autocomplete") || element.getAttribute("role") === "combobox") {
            const selected = await typeAndSelectAutocomplete(element, value);
            return selected
                ? { status: "filled" }
                : { status: "failed", message: "No equivalent autocomplete option was found." };
        }
        setNativeValue(element, value);
        return cleanText(element.value || element.textContent) ? { status: "filled" } : { status: "failed", message: "The site rejected the value." };
    };

    const base64ToBytes = value => {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    };
    const attachResume = (fieldKey, fileData) => {
        const entry = registry.get(fieldKey);
        const element = entry?.element;
        if (!(element instanceof HTMLInputElement) || element.type !== "file" || !element.isConnected) {
            return { status: "failed", message: "The résumé file input moved. Rescan and try again." };
        }
        if (element.files?.length) return { status: "skipped", message: "A résumé is already attached." };
        try {
            const file = new File([base64ToBytes(fileData.base64)], fileData.fileName, { type: fileData.mimeType });
            const transfer = new DataTransfer();
            transfer.items.add(file);
            element.files = transfer.files;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            return element.files?.length
                ? { status: "filled", message: `Attached ${file.name}.` }
                : { status: "failed", message: "The site did not accept the primary résumé." };
        } catch (error) {
            return { status: "failed", message: "The site did not accept the primary résumé." };
        }
    };

    const overlay = {
        show() {
            if (document.getElementById("jobpilot-autofill-overlay")) return;
            const root = document.createElement("div");
            root.id = "jobpilot-autofill-overlay";
            root.innerHTML = `<div class="jobpilot-autofill-card" role="status" aria-live="polite">
                <div class="jobpilot-mark">↗</div>
                <div class="jobpilot-spinner" aria-hidden="true"></div>
                <div><strong>Autofilling your application</strong><span>JobPilot is matching your Profile answers.</span></div>
            </div>`;
            const style = document.createElement("style");
            style.textContent = `#jobpilot-autofill-overlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(20,33,61,.28);backdrop-filter:blur(3px);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.jobpilot-autofill-card{display:grid;grid-template-columns:38px 42px minmax(220px,1fr);align-items:center;gap:14px;width:min(440px,calc(100vw - 36px));padding:20px 22px;box-sizing:border-box;border:1px solid rgba(255,255,255,.75);border-radius:20px;background:#fff;box-shadow:0 24px 70px rgba(20,33,61,.24)}.jobpilot-mark{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:#3368b8;color:#fff;font-size:22px;font-weight:800}.jobpilot-spinner{width:30px;height:30px;border:4px solid #dce7f6;border-top-color:#3368b8;border-right-color:#18bfa0;border-radius:50%;animation:jobpilot-spin .85s linear infinite}.jobpilot-autofill-card strong,.jobpilot-autofill-card span{display:block}.jobpilot-autofill-card strong{color:#172033;font-size:15px}.jobpilot-autofill-card span{margin-top:3px;color:#68758a;font-size:12px;line-height:1.35}@keyframes jobpilot-spin{to{transform:rotate(360deg)}}`;
            root.appendChild(style);
            document.documentElement.appendChild(root);
        },
        hide() { document.getElementById("jobpilot-autofill-overlay")?.remove(); },
    };

    const applyPlan = async answers => {
        overlay.show();
        const results = [];
        try {
            for (const answer of answers || []) {
                if (answer.action !== "fill") continue;
                const entry = registry.get(answer.fieldKey);
                const outcome = entry
                    ? await fillEntry(entry, answer)
                    : { status: "failed", message: "Rescan the page before filling this field." };
                results.push({ fieldKey: answer.fieldKey, ...outcome });
            }
            return results;
        } finally {
            await wait(250);
            overlay.hide();
        }
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === "JOBPILOT_PING") {
            sendResponse({ ready: true });
            return false;
        }
        if (message?.type === "JOBPILOT_SCAN_FIELDS") {
            sendResponse({ fields: scanFields(), job: jobMetadata(), unavailable: pageUnavailable() });
            return false;
        }
        if (message?.type === "JOBPILOT_APPLY_PLAN") {
            applyPlan(message.answers)
                .then(results => sendResponse({ results }))
                .catch(error => sendResponse({ results: [], error: error.message }));
            return true;
        }
        if (message?.type === "JOBPILOT_FOCUS_FIELD") {
            try { sendResponse(focusEntry(message.fieldKey)); }
            catch (error) { sendResponse({ focused: false, error: error.message }); }
            return false;
        }
        if (message?.type === "JOBPILOT_ATTACH_RESUME") {
            sendResponse(attachResume(message.fieldKey, message.file || {}));
            return false;
        }
        return false;
    });
})();
