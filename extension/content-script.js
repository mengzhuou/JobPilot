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
    const selectControl = element => element.closest("[class*='__control'], [class$='-control']");
    const reactSelectRoot = element => {
        if (element.getAttribute("role") !== "combobox" || !selectControl(element)) return null;
        return element.closest(".select-shell, [class$='-container']") || selectControl(element).parentElement;
    };
    const selectedDisplay = element => {
        const root = reactSelectRoot(element);
        return cleanText(Array.from(root?.querySelectorAll(
            "[class*='__single-value'], [class$='-singleValue'], [class*='__multi-value__label']"
        ) || []).map(node => node.textContent).join(", "));
    };
    const controlVisible = element => element.getAttribute("aria-hidden") !== "true"
        && (visible(element) || (reactSelectRoot(element) && visible(selectControl(element))));
    const fieldValue = (type, element) => {
        if (reactSelectRoot(element)) return selectedDisplay(element);
        if (type === "select") return cleanText(element.selectedOptions?.[0]?.textContent);
        return cleanText(element.value || element.textContent);
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
    const ERROR_SELECTOR = "[role='alert'], [aria-live='assertive'], .error-message, .field-error, .input-error, [class*='errorMessage'], [class*='error-message'], [data-testid*='error'], [id*='error']";
    const FIELD_CONTROL_SELECTOR = "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='combobox'], button[aria-haspopup='listbox'], [role='button'][aria-haspopup='listbox']";
    const leafControls = container => Array.from(container?.querySelectorAll?.(FIELD_CONTROL_SELECTOR) || [])
        .filter(item => !item.disabled && controlVisible(item))
        .filter(item => !(item.matches("[role='combobox']") && item.querySelector("input, textarea, select, button")));
    const ownedErrorText = element => {
        let container = element.parentElement;
        for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
            const controls = leafControls(container);
            if (controls.length > 1) break;
            const errorNode = Array.from(container.querySelectorAll(ERROR_SELECTOR))
                .find(node => visible(node) && cleanText(node.innerText || node.textContent));
            const errorText = cleanText(errorNode?.innerText || errorNode?.textContent);
            if (errorText && errorText.length <= 500) return errorText;
        }
        return "";
    };
    const fieldErrorMessage = (element, elements = [element]) => {
        const describedIds = elements.flatMap(item => [item?.getAttribute?.("aria-describedby"), item?.getAttribute?.("aria-errormessage")]
            .filter(Boolean).flatMap(ids => ids.split(/\s+/))).filter(Boolean);
        const describedNodes = [...new Set(describedIds)].map(id => document.getElementById(id)).filter(Boolean);
        const describedErrorText = cleanText(describedNodes
            .filter(node => node.matches(ERROR_SELECTOR) && visible(node))
            .map(node => node.innerText || node.textContent).join(" "));
        if (describedErrorText && describedErrorText.length <= 500) return describedErrorText;
        const nativeMessage = elements.map(item => {
            try { return item?.validity?.valid === false ? cleanText(item.validationMessage) : ""; }
            catch { return ""; }
        }).find(Boolean);
        if (nativeMessage) return nativeMessage;
        const errorText = ownedErrorText(element);
        if (errorText && errorText.length <= 500) return errorText;
        if (elements.some(item => item?.getAttribute?.("aria-invalid") === "true")) {
            const describedText = cleanText(describedNodes.map(node => node.innerText || node.textContent).join(" "));
            return describedText && describedText.length <= 500 ? describedText : "This field is marked invalid.";
        }
        return "";
    };
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
            const value = fieldValue(type, element);
            return Boolean(value && !/^(select|choose|please select|--)/i.test(value));
        }
        return Boolean(cleanText(element.value || element.textContent));
    };
    const typeFor = element => {
        if (element.matches("select")) return "select";
        if (element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox") return "combobox";
        if (element.matches("textarea")) return "textarea";
        if (element.isContentEditable) return "textarea";
        return String(element.type || "text").toLowerCase();
    };

    const scanFields = () => {
        registry.clear();
        const elements = Array.from(document.querySelectorAll(
            FIELD_CONTROL_SELECTOR
        )).filter(element => !element.disabled && (controlVisible(element) || typeFor(element) === "file"))
            .filter(element => !(element.matches("[role='combobox']") && element.querySelector("input, textarea, select, button")))
            .slice(0, MAX_FIELDS * 2);
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
                const errorMessage = fieldErrorMessage(element, group);
                registry.set(key, { type, element, elements: group, errorMessage, label: nearestText(element) });
                fields.push({
                    fieldKey: key,
                    label: nearestText(element),
                    placeholder: "",
                    autocomplete: cleanText(element.autocomplete),
                    name: cleanText(element.name),
                    type,
                    required: group.some(item => item.required || item.getAttribute("aria-required") === "true"),
                    filled: isFilled(type, element, group) && !errorMessage,
                    currentValue: selectedRadioValue(group),
                    options: group.map(optionLabel).filter(Boolean),
                    hasError: Boolean(errorMessage),
                    errorMessage,
                });
                return;
            }
            const key = stableKey(element, index);
            const options = type === "select"
                ? Array.from(element.options).map(option => cleanText(option.textContent)).filter(Boolean)
                : [];
            const errorMessage = fieldErrorMessage(element);
            registry.set(key, { type, element, elements: [element], errorMessage, label: nearestText(element) });
            fields.push({
                fieldKey: key,
                label: nearestText(element),
                placeholder: cleanText(element.placeholder),
                autocomplete: cleanText(element.autocomplete),
                name: cleanText(element.name),
                type,
                context: type === "file" ? fileContext(element) : "",
                required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
                filled: isFilled(type, element) && !errorMessage,
                currentValue: type === "checkbox"
                    ? (element.checked ? optionLabel(element) || "Yes" : "")
                    : type === "file"
                        ? Array.from(element.files || []).map(file => file.name).join(", ")
                        : fieldValue(type, element),
                options,
                hasError: Boolean(errorMessage),
                errorMessage,
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

    const dispatchInput = (element, value) => {
        try {
            element.dispatchEvent(new InputEvent("input", {
                bubbles: true,
                composed: true,
                inputType: "insertText",
                data: value,
            }));
        } catch {
            element.dispatchEvent(new Event("input", { bubbles: true }));
        }
    };
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
        dispatchInput(element, value);
        if (commit) {
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));
        }
    };
    const setNativeSelectValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
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
    const optionText = option => cleanText(option?.innerText || option?.textContent);
    const autocompleteMenus = element => {
        const ids = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
            .filter(Boolean).flatMap(value => value.split(/\s+/));
        // React Select portals its menu outside the field. Follow the ID relation;
        // screen distance and unrelated matching text do not identify an option.
        if (ids.length) return ids.map(id => document.getElementById(id)).filter(node => node && visible(node));
        const root = reactSelectRoot(element);
        if (root) return Array.from(root.querySelectorAll("[role='listbox'], [class*='__menu-list']")).filter(visible);
        const group = element.closest(".field, .form-field, .select__container") || element.parentElement;
        return Array.from(group?.querySelectorAll("[role='listbox']") || []).filter(visible);
    };
    const autocompleteOptions = element => autocompleteMenus(element).flatMap(menu =>
        Array.from(menu.querySelectorAll("[role='option'], [class*='__option'], li[data-value]"))
            .filter(node => !node.disabled && node.getAttribute("aria-disabled") !== "true" && visible(node) && optionText(node))
    );
    const comparableOption = text => {
        const value = normalized(cleanText(text).replace(/\s+\+\d[\d\s()-]*$/, ""));
        if (/^(true|yes)$/.test(value)) return "yes";
        if (/^(false|no)$/.test(value)) return "no";
        if (/^(us|usa|united states of america)$/.test(value)) return "united states";
        return value;
    };
    const chooseAutocompleteOption = (options, value, context = {}) => {
        const target = comparableOption(value);
        let matches = options.filter(option => comparableOption(optionText(option)) === target);
        if (!matches.length && context.city) {
            matches = options.filter(option => normalized(optionText(option).split(",")[0]) === normalized(context.city));
        }
        if (!matches.length) matches = options.filter(option => semanticMatch([optionText(option)], value));
        if (context.city && matches.length) {
            matches = matches.filter(option => normalized(optionText(option).split(",")[0]) === normalized(context.city));
            for (const hint of [context.state, context.country].filter(Boolean)) {
                const tokens = comparableOption(hint);
                const narrowed = matches.filter(option => optionText(option).split(",").some(part => comparableOption(part) === tokens));
                // A menu with geographic detail must agree with the saved location.
                if (matches.some(option => optionText(option).includes(","))) matches = narrowed;
            }
        }
        const labels = new Set(matches.map(option => comparableOption(optionText(option))));
        return labels.size === 1 ? matches[0] : null;
    };
    const mouseClick = element => {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = element.getBoundingClientRect();
        const options = { bubbles: true, cancelable: true, composed: true, button: 0,
            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        for (const name of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            if (!element.isConnected) break;
            const EventType = name.startsWith("pointer") ? PointerEvent : MouseEvent;
            element.dispatchEvent(new EventType(name, { ...options, buttons: name.endsWith("down") ? 1 : 0 }));
        }
    };
    const typeAndSelectAutocomplete = async (element, value, context) => {
        element.scrollIntoView({ block: "center", inline: "nearest" });
        element.focus({ preventScroll: true });
        // Standard React Select opens on mousedown. Greenhouse controls the menu
        // on mouseup. HTMLElement.click() alone runs neither handler.
        if (element.getAttribute("aria-expanded") !== "true") mouseClick(element);
        await wait(60);
        let option = chooseAutocompleteOption(autocompleteOptions(element), value, context);
        const editable = !element.readOnly && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable);
        if (!option && editable) {
            setNativeValue(element, "", { commit: false });
            await wait(40);
            const query = /^(true|false)$/i.test(value) ? (comparableOption(value) === "yes" ? "Yes" : "No") : value;
            setNativeValue(element, query, { commit: false });
            await wait(100);
        }
        if (element.getAttribute("aria-expanded") !== "true" && !autocompleteMenus(element).length) mouseClick(element);

        const deadline = Date.now() + 3500;
        while (Date.now() < deadline) {
            option = chooseAutocompleteOption(autocompleteOptions(element), value, context);
            if (option) break;
            await wait(100);
        }
        if (!option) {
            element.blur();
            return { status: "failed", message: "No unique matching suggestion was found. Select an option on the application." };
        }
        mouseClick(option);
        await wait(100);
        // A synthetic blur event does not move focus or invoke React's focusout
        // handler. Real blur also proves that the site's selection survives.
        element.blur();
        await wait(180);
        let committed = "";
        const verificationDeadline = Date.now() + 1200;
        do {
            committed = fieldValue("combobox", element);
            if (committed && element.getAttribute("aria-expanded") !== "true" && !fieldErrorMessage(element)) break;
            await wait(100);
        } while (Date.now() < verificationDeadline);
        if (!committed || element.getAttribute("aria-expanded") === "true" || fieldErrorMessage(element)) {
            return { status: "failed", message: fieldErrorMessage(element) || "The application did not retain the selected suggestion. Please select it manually." };
        }
        // Search inputs become empty after React Select commits a separate value.
        if (!reactSelectRoot(element) && !semanticMatch([committed], value)) {
            return { status: "failed", message: "The application retained a different option. Please review this field." };
        }
        return { status: "filled" };
    };
    const isAutocompleteField = entry => {
        const { element } = entry;
        if (entry.type === "combobox") return true;
        return ["list", "both"].includes(element.getAttribute("aria-autocomplete"))
            || Boolean(element.getAttribute("aria-controls") && autocompleteMenus(element).length);
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
        const reportedError = fieldErrorMessage(element, elements);
        if (isFilled(type, element, elements) && !reportedError) return { status: "skipped", message: "Already filled." };
        const value = cleanText(answer.value);

        if (type === "checkbox") {
            if (!element.checked && /^(true|yes|acknowledge|acknowledge confirm)$/i.test(normalized(value))) clickReactAware(element);
            else if (element.checked && reportedError) {
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
                element.dispatchEvent(new Event("blur", { bubbles: true }));
            }
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
            if (reportedError && element.selectedIndex === index) {
                const placeholder = Array.from(element.options).find(option => !cleanText(option.value) || /^(select|choose|please select|--)/i.test(cleanText(option.textContent)));
                if (placeholder) {
                    setNativeSelectValue(element, placeholder.value);
                    await wait(60);
                }
            }
            setNativeSelectValue(element, element.options[index].value);
            element.dispatchEvent(new Event("blur", { bubbles: true }));
            return { status: cleanText(element.value) ? "filled" : "failed" };
        }
        if (isAutocompleteField(entry)) {
            return typeAndSelectAutocomplete(element, value, answer.optionContext);
        }
        setNativeValue(element, value);
        return cleanText(element.value || element.textContent) ? { status: "filled" } : { status: "failed", message: "The site rejected the value." };
    };

    const waitForValidation = async (entry, timeout = 1600) => {
        const started = Date.now();
        let message = "";
        do {
            message = entry?.element?.isConnected ? fieldErrorMessage(entry.element, entry.elements) : "";
            if (!message) return "";
            await wait(100);
        } while (Date.now() - started < timeout);
        return message;
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
                const validationError = outcome.status === "filled"
                    ? await waitForValidation(entry, entry.errorMessage ? 1600 : 200)
                    : "";
                results.push({
                    fieldKey: answer.fieldKey,
                    ...outcome,
                    ...(outcome.status === "filled" && validationError
                        ? { status: "failed", message: validationError }
                        : {}),
                });
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
