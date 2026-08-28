const { chromium } = require("playwright");
const profile = require("./profile.json");
const path = require("path");

let context = null;
let page = null;

const resumePath = path.resolve(
    __dirname,
    "./Mengzhu Ou_Resume.pdf"
);

const userDataDir = path.resolve(
    __dirname,
    "./playwright-profile"
);


// ==================================================
// HELPERS
// ==================================================

const normalizeText = (text) => {
    if (text === null || text === undefined) {
        return "";
    }

    return String(text)
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
};


// ==================================================
// BOOLEAN → FORM OPTION
// ==================================================

const getBooleanFormAnswer = (
    value,
    options = []
) => {

    if (typeof value !== "boolean") {
        return value;
    }

    const normalizedOptions =
        options.map(normalizeText);

    if (value === true) {

        const yesIndex =
            normalizedOptions.findIndex(
                option =>
                    option === "yes" ||
                    option.startsWith("yes ") ||
                    option.includes("yes i")
            );

        if (yesIndex !== -1) {
            return options[yesIndex];
        }
    }

    if (value === false) {

        const noIndex =
            normalizedOptions.findIndex(
                option =>
                    option === "no" ||
                    option.startsWith("no ") ||
                    option.includes("no i")
            );

        if (noIndex !== -1) {
            return options[noIndex];
        }
    }

    return value;
};


// ==================================================
// PROFILE VALUE
// ==================================================

const getProfileValue = (field) => {

    const question =
        normalizeText(
            field.question ||
            field.label ||
            field.placeholder ||
            field.ariaLabel ||
            ""
        );

    const name =
        normalizeText(field.name || "");

    const id =
        normalizeText(field.id || "");


    // --------------------------------------------------
    // NAME
    // --------------------------------------------------

    if (
        name === "_systemfield_name" ||
        id === "_systemfield_name" ||
        question === "name" ||
        question.includes("full name") ||
        question.includes("first name") ||
        question.includes("last name")
    ) {

        return {
            value: profile.candidate.name,
            source: "candidate.name"
        };
    }


    // --------------------------------------------------
    // EMAIL
    // --------------------------------------------------

    if (
        name === "_systemfield_email" ||
        id === "_systemfield_email" ||
        question === "email" ||
        question.includes("email address")
    ) {

        return {
            value: profile.candidate.email,
            source: "candidate.email"
        };
    }


    // --------------------------------------------------
    // PHONE
    // --------------------------------------------------

    if (
        field.type === "tel" ||
        question.includes("phone") ||
        question.includes("mobile")
    ) {

        return {
            value: profile.candidate.phone,
            source: "candidate.phone"
        };
    }


    // --------------------------------------------------
    // LOCATION
    // --------------------------------------------------

    if (
        question === "location" ||
        question === "current location" ||
        question.includes("current city")
    ) {

        return {
            value:
                `${profile.candidate.location.city}, ${profile.candidate.location.state}`,

            source:
                "candidate.location"
        };
    }


    // --------------------------------------------------
    // LINKEDIN
    // --------------------------------------------------

    if (
        question.includes("linkedin")
    ) {

        return {
            value:
                profile.candidate.links.linkedin,

            source:
                "candidate.links.linkedin"
        };
    }


    // --------------------------------------------------
    // HOW DID YOU HEAR ABOUT COMPANY
    // --------------------------------------------------

    if (
        question.includes("how did you first hear") ||
        question.includes("how did you hear about")
    ) {

        return {
            value:
                profile.application_answers
                    ?.tiktok
                    ?.how_heard_about_company,

            source:
                "application_answers.tiktok.how_heard_about_company"
        };
    }


    // --------------------------------------------------
    // US CITIZEN / PERMANENT RESIDENT
    // --------------------------------------------------

    if (
        question.includes("us citizen") ||
        question.includes("permanent resident")
    ) {

        return {
            value:
                profile.work_authorization
                    ?.us_citizen_or_permanent_resident,

            source:
                "work_authorization.us_citizen_or_permanent_resident"
        };
    }


    // --------------------------------------------------
    // GENDER
    // --------------------------------------------------

    if (
        name.includes("gender") ||
        id.includes("gender") ||
        question === "gender"
    ) {

        return {
            value:
                profile.eeoc
                    ?.gender
                    ?.form_option,

            source:
                "eeoc.gender.form_option"
        };
    }


    // --------------------------------------------------
    // RACE
    // --------------------------------------------------

    if (
        name.includes("race") ||
        id.includes("race") ||
        question === "race"
    ) {

        return {
            value:
                profile.eeoc
                    ?.race
                    ?.form_option,

            source:
                "eeoc.race.form_option"
        };
    }


    // --------------------------------------------------
    // VETERAN
    // --------------------------------------------------

    if (
        name.includes("veteran") ||
        id.includes("veteran") ||
        question.includes("veteran")
    ) {

        return {
            value:
                profile.eeoc
                    ?.veteran_status
                    ?.form_option,

            source:
                "eeoc.veteran_status.form_option"
        };
    }


    // --------------------------------------------------
    // NO MATCH
    // --------------------------------------------------

    return null;
};


// ==================================================
// DEBUG INTERACTIVE ELEMENTS
// ==================================================

const inspectInteractiveElements = async (page) => {

    console.log(
        "\n========== INTERACTIVE ELEMENTS =========="
    );

    const interactive =
        await page.locator(
            `
            button,
            [role="button"],
            [aria-expanded],
            [tabindex="0"]
            `
        ).evaluateAll(elements =>
            elements.map((el, index) => ({
                index,

                tag:
                    el.tagName,

                role:
                    el.getAttribute("role"),

                text:
                    el.innerText?.trim(),

                ariaExpanded:
                    el.getAttribute("aria-expanded"),

                ariaControls:
                    el.getAttribute("aria-controls"),

                class:
                    typeof el.className === "string"
                        ? el.className
                        : ""
            }))
        );

    console.log(
        JSON.stringify(
            interactive,
            null,
            2
        )
    );

    console.log(
        "=========================================="
    );
};


// ==================================================
// WAIT FOR APPLICATION UI
// ==================================================

const waitForApplicationUI = async (page) => {

    console.log(
        "\n========== WAITING FOR APPLICATION UI =========="
    );


    // Wait for React to settle.
    await page.waitForLoadState(
        "domcontentloaded"
    ).catch(() => {});


    await page.waitForTimeout(
        2000
    );


    // Try waiting for common application elements.
    try {

        await page.waitForFunction(
            () => {

                return (
                    document.querySelectorAll(
                        "input, textarea, select, button"
                    ).length > 1
                );
            },
            {
                timeout: 15000
            }
        );

    } catch {

        console.log(
            "Application fields have not appeared yet."
        );
    }


    console.log(
        "Current URL:",
        page.url()
    );

    console.log(
        "Page title:",
        await page.title()
    );

    console.log(
        "================================================"
    );
};


// ==================================================
// EXPAND ACCORDIONS
// ==================================================

const expandAllAccordions = async (page) => {

    console.log(
        "\n========== EXPANDING ACCORDIONS =========="
    );


    /*
     * TikTok's application page is dynamically rendered.
     *
     * We intentionally inspect several patterns rather
     * than relying on one fragile class name.
     */


    for (let pass = 0; pass < 5; pass++) {

        const candidates =
            page.locator(
                `
                button[aria-expanded="false"],
                [role="button"][aria-expanded="false"],
                [aria-expanded="false"]
                `
            );


        const count =
            await candidates.count();


        console.log(
            `Accordion pass ${pass + 1}: ${count} collapsed elements`
        );


        if (count === 0) {
            break;
        }


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const element =
                candidates.nth(i);


            try {

                const visible =
                    await element.isVisible()
                        .catch(() => false);


                if (!visible) {
                    continue;
                }


                const text =
                    await element.innerText()
                        .catch(() => "");


                console.log(
                    `Expanding: "${text.trim()}"`
                );


                await element.click({
                    force: true
                });


                // Give React time to render
                // the contents of the section.
                await page.waitForTimeout(
                    500
                );

            } catch (error) {

                console.log(
                    "Accordion click failed:",
                    error.message
                );
            }
        }
    }


    /*
     * Some accordion implementations don't expose
     * aria-expanded on the clickable element.
     *
     * Look for common expandable headings.
     */

    const textCandidates =
        page.locator(
            `
            button,
            [role="button"]
            `
        );


    const textCount =
        await textCandidates.count();


    for (
        let i = 0;
        i < textCount;
        i++
    ) {

        const element =
            textCandidates.nth(i);


        try {

            if (
                !(await element.isVisible())
            ) {
                continue;
            }


            const text =
                normalizeText(
                    await element.innerText()
                );


            /*
             * Only click things that look like
             * section headers.
             *
             * Avoid clicking Submit / Save / Next.
             */

            const looksLikeSection =
                text.includes("personal") ||
                text.includes("experience") ||
                text.includes("education") ||
                text.includes("resume") ||
                text.includes("work authorization") ||
                text.includes("additional") ||
                text.includes("candidate") ||
                text.includes("application");


            const dangerous =
                text.includes("submit") ||
                text.includes("apply") ||
                text.includes("save") ||
                text.includes("next") ||
                text.includes("delete");


            if (
                looksLikeSection &&
                !dangerous
            ) {

                const expanded =
                    await element.getAttribute(
                        "aria-expanded"
                    );


                if (
                    expanded !== "true"
                ) {

                    console.log(
                        `Trying section: "${text}"`
                    );


                    await element.click({
                        force: true
                    });


                    await page.waitForTimeout(
                        500
                    );
                }
            }

        } catch {
            // Ignore stale/detached elements.
        }
    }


    await page.waitForTimeout(
        1500
    );


    console.log(
        "Accordion expansion complete."
    );

    console.log(
        "=========================================="
    );
};


// ==================================================
// EXTRACT FORM FIELDS
// ==================================================

const extractApplicationFields = async (page) => {

    console.log(
        "\n========== EXTRACTING FORM FIELDS =========="
    );


    const fields =
        await page
            .locator(
                "input, textarea, select"
            )
            .evaluateAll(
                elements => {

                    const cleanText =
                        text => {

                            if (!text) {
                                return null;
                            }

                            return String(text)
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();
                        };


                    const getLabelFor =
                        id => {

                            if (!id) {
                                return null;
                            }


                            const label =
                                document.querySelector(
                                    `label[for="${CSS.escape(id)}"]`
                                );


                            return label
                                ? cleanText(
                                    label.innerText
                                )
                                : null;
                        };


                    const getQuestion =
                        element => {

                            // ----------------------------------
                            // Label
                            // ----------------------------------

                            let label =
                                getLabelFor(
                                    element.id
                                );


                            if (label) {
                                return label;
                            }


                            // ----------------------------------
                            // Parent label
                            // ----------------------------------

                            const parentLabel =
                                element.closest(
                                    "label"
                                );


                            if (parentLabel) {

                                return cleanText(
                                    parentLabel.innerText
                                );
                            }


                            // ----------------------------------
                            // aria-label
                            // ----------------------------------

                            const ariaLabel =
                                element.getAttribute(
                                    "aria-label"
                                );


                            if (ariaLabel) {
                                return cleanText(
                                    ariaLabel
                                );
                            }


                            // ----------------------------------
                            // aria-labelledby
                            // ----------------------------------

                            const labelledBy =
                                element.getAttribute(
                                    "aria-labelledby"
                                );


                            if (labelledBy) {

                                const ids =
                                    labelledBy.split(
                                        /\s+/
                                    );


                                const text =
                                    ids
                                        .map(id => {

                                            const el =
                                                document.getElementById(
                                                    id
                                                );

                                            return el
                                                ? el.innerText
                                                : "";
                                        })
                                        .join(" ");


                                if (text) {
                                    return cleanText(text);
                                }
                            }


                            // ----------------------------------
                            // Parent containers
                            // ----------------------------------

                            let current =
                                element.parentElement;


                            for (
                                let depth = 0;
                                depth < 8 &&
                                current;
                                depth++
                            ) {

                                const text =
                                    cleanText(
                                        current.innerText
                                    );


                                const placeholder =
                                    element.getAttribute(
                                        "placeholder"
                                    );


                                if (
                                    text &&
                                    text.length < 500
                                ) {

                                    let candidate =
                                        text;


                                    if (placeholder) {

                                        candidate =
                                            candidate
                                                .replace(
                                                    placeholder,
                                                    ""
                                                )
                                                .trim();
                                    }


                                    if (
                                        candidate &&
                                        candidate.length < 300
                                    ) {

                                        return candidate;
                                    }
                                }


                                current =
                                    current.parentElement;
                            }


                            return null;
                        };


                    return elements.map(
                        (element, index) => {

                            const rawType =
                                element.getAttribute(
                                    "type"
                                );


                            let type =
                                rawType;


                            if (
                                element.tagName
                                    .toLowerCase() ===
                                "textarea"
                            ) {

                                type =
                                    "textarea";
                            }


                            if (
                                element.tagName
                                    .toLowerCase() ===
                                "select"
                            ) {

                                type =
                                    "select";
                            }


                            const name =
                                element.getAttribute(
                                    "name"
                                );


                            const id =
                                element.getAttribute(
                                    "id"
                                );


                            const question =
                                getQuestion(
                                    element
                                );


                            // ----------------------------------
                            // SELECT OPTIONS
                            // ----------------------------------

                            let options = [];


                            if (
                                type === "select"
                            ) {

                                options =
                                    Array.from(
                                        element.options
                                    ).map(
                                        option =>
                                            cleanText(
                                                option.textContent
                                            )
                                    )
                                    .filter(
                                        Boolean
                                    );
                            }


                            // ----------------------------------
                            // RADIO / CHECKBOX OPTIONS
                            // ----------------------------------

                            if (
                                (
                                    type === "radio" ||
                                    type === "checkbox"
                                ) &&
                                name
                            ) {

                                const related =
                                    Array.from(
                                        document.querySelectorAll(
                                            `input[name="${CSS.escape(name)}"]`
                                        )
                                    );


                                options =
                                    related
                                        .map(
                                            relatedElement => {

                                                let text =
                                                    getLabelFor(
                                                        relatedElement.id
                                                    );


                                                if (!text) {

                                                    const label =
                                                        relatedElement.closest(
                                                            "label"
                                                        );


                                                    if (label) {

                                                        text =
                                                            cleanText(
                                                                label.innerText
                                                            );
                                                    }
                                                }


                                                return text;
                                            }
                                        )
                                        .filter(
                                            Boolean
                                        );
                            }


                            options =
                                [
                                    ...new Set(
                                        options
                                    )
                                ];


                            // ----------------------------------
                            // SYSTEM FIELD
                            // ----------------------------------

                            const systemField =
                                Boolean(
                                    (
                                        name &&
                                        name.startsWith(
                                            "_systemfield_"
                                        )
                                    ) ||
                                    (
                                        id &&
                                        id.startsWith(
                                            "_systemfield_"
                                        )
                                    )
                                );


                            return {

                                index,

                                tag:
                                    element.tagName
                                        .toLowerCase(),

                                type,

                                name,

                                id,

                                placeholder:
                                    element.getAttribute(
                                        "placeholder"
                                    ),

                                required:
                                    element.hasAttribute(
                                        "required"
                                    ),

                                ariaLabel:
                                    element.getAttribute(
                                        "aria-label"
                                    ),

                                label:
                                    getLabelFor(id),

                                question,

                                options,

                                systemField
                            };
                        }
                    );
                }
            );


    console.log(
        `Found ${fields.length} form elements.`
    );


    return fields.filter(
        field => {

            if (
                field.name ===
                "g-recaptcha-response"
            ) {
                return false;
            }


            if (
                field.id &&
                field.id.startsWith(
                    "g-recaptcha-response"
                )
            ) {
                return false;
            }


            return true;
        }
    );
};


// ==================================================
// PRINT FIELDS
// ==================================================

const printApplicationFields = (
    fields
) => {

    console.log(
        "\n========== NORMALIZED FORM FIELDS =========="
    );


    fields.forEach(
        field => {

            console.log(
                `\nField #${field.index}`
            );

            console.log(
                "  Type:        ",
                field.type
            );

            console.log(
                "  Name:        ",
                field.name
            );

            console.log(
                "  ID:          ",
                field.id
            );

            console.log(
                "  Question:    ",
                field.question
            );

            console.log(
                "  Label:       ",
                field.label
            );

            console.log(
                "  Placeholder: ",
                field.placeholder
            );

            console.log(
                "  Required:    ",
                field.required
            );

            console.log(
                "  System:      ",
                field.systemField
            );

            if (
                field.options.length
            ) {

                console.log(
                    "  Options:     ",
                    field.options
                );
            }
        }
    );


    console.log(
        "\n============================================="
    );
};


// ==================================================
// UPLOAD RESUME
// ==================================================

const uploadResume = async (page) => {

    console.log(
        "\n========== UPLOADING RESUME =========="
    );


    const fileInputs =
        page.locator(
            'input[type="file"]'
        );


    const count =
        await fileInputs.count();


    console.log(
        "File inputs found:",
        count
    );


    if (count === 0) {

        console.log(
            "Resume input is not currently visible."
        );

        console.log(
            "This may mean TikTok handles resume upload through a custom UI."
        );

        console.log(
            "======================================"
        );

        return false;
    }


    try {

        await fileInputs
            .first()
            .setInputFiles(
                resumePath
            );


        console.log(
            "RESUME UPLOADED:",
            resumePath
        );


        await page.waitForTimeout(
            5000
        );


        console.log(
            "Resume processing complete."
        );


        return true;

    } catch (error) {

        console.error(
            "RESUME UPLOAD FAILED:",
            error.message
        );


        return false;
    }
};


// ==================================================
// GET LOCATOR
// ==================================================

const getFieldLocator = (
    page,
    field
) => {

    if (field.id) {

        return page.locator(
            `[id="${field.id}"]`
        );
    }


    if (field.name) {

        return page.locator(
            `[name="${field.name}"]`
        );
    }


    return null;
};


// ==================================================
// FILL TEXT FIELD
// ==================================================

const fillTextField = async (
    page,
    field,
    value
) => {

    const locator =
        getFieldLocator(
            page,
            field
        );


    if (!locator) {

        console.log(
            "Could not create locator."
        );

        return false;
    }


    try {

        await locator
            .first()
            .scrollIntoViewIfNeeded();


        await locator
            .first()
            .fill(
                String(value)
            );


        console.log(
            "FILLED:",
            value
        );


        return true;

    } catch (error) {

        console.log(
            "FILL ERROR:",
            error.message
        );


        return false;
    }
};


// ==================================================
// FILL SELECT
// ==================================================

const fillSelect = async (
    page,
    field,
    value
) => {

    const locator =
        getFieldLocator(
            page,
            field
        );


    if (!locator) {
        return false;
    }


    try {

        const options =
            await locator
                .first()
                .locator("option")
                .allTextContents();


        console.log(
            "SELECT OPTIONS:",
            options
        );


        const normalizedValue =
            normalizeText(value);


        const matchingOption =
            options.find(
                option =>
                    normalizeText(option) ===
                    normalizedValue
            );


        if (!matchingOption) {

            console.log(
                `No exact select option for "${value}"`
            );

            return false;
        }


        await locator
            .first()
            .selectOption({
                label: matchingOption
            });


        console.log(
            "SELECTED:",
            matchingOption
        );


        return true;

    } catch (error) {

        console.log(
            "SELECT ERROR:",
            error.message
        );


        return false;
    }
};


// ==================================================
// FILL RADIO
// ==================================================

const fillRadio = async (
    page,
    field,
    value,
    fields
) => {

    const answer =
        getBooleanFormAnswer(
            value,
            field.options
        );


    const normalizedAnswer =
        normalizeText(answer);


    const matchingField =
        fields.find(
            candidate => {

                return (
                    candidate.type === "radio" &&
                    candidate.name === field.name &&
                    normalizeText(
                        candidate.label
                    ) === normalizedAnswer
                );
            }
        );


    if (!matchingField) {

        console.log(
            "RADIO OPTION NOT FOUND:",
            answer
        );

        return false;
    }


    try {

        if (
            matchingField.id
        ) {

            await page
                .locator(
                    `[id="${matchingField.id}"]`
                )
                .check({
                    force: true
                });

        } else {

            await page
                .getByLabel(
                    matchingField.label,
                    {
                        exact: true
                    }
                )
                .check({
                    force: true
                });
        }


        console.log(
            "CHECKED RADIO:",
            matchingField.label
        );


        return true;

    } catch (error) {

        console.log(
            "RADIO ERROR:",
            error.message
        );


        return false;
    }
};


// ==================================================
// FILL CHECKBOX
// ==================================================

const fillCheckbox = async (
    page,
    field,
    value,
    fields
) => {

    if (
        typeof value === "boolean"
    ) {

        if (!value) {
            return true;
        }


        if (!field.id) {
            return false;
        }


        try {

            await page
                .locator(
                    `[id="${field.id}"]`
                )
                .check({
                    force: true
                });


            console.log(
                "CHECKED CHECKBOX:",
                field.label
            );


            return true;

        } catch (error) {

            console.log(
                "CHECKBOX ERROR:",
                error.message
            );


            return false;
        }
    }


    const answer =
        getBooleanFormAnswer(
            value,
            field.options
        );


    const normalizedAnswer =
        normalizeText(answer);


    const matchingField =
        fields.find(
            candidate =>
                candidate.type === "checkbox" &&
                candidate.name === field.name &&
                normalizeText(
                    candidate.label
                ) === normalizedAnswer
        );


    if (!matchingField) {

        console.log(
            "CHECKBOX OPTION NOT FOUND:",
            answer
        );

        return false;
    }


    try {

        await page
            .locator(
                `[id="${matchingField.id}"]`
            )
            .check({
                force: true
            });


        console.log(
            "CHECKED CHECKBOX:",
            matchingField.label
        );


        return true;

    } catch (error) {

        console.log(
            "CHECKBOX ERROR:",
            error.message
        );


        return false;
    }
};


// ==================================================
// FILL APPLICATION
// ==================================================

const fillApplicationFields = async (
    page,
    fields
) => {

    console.log(
        "\n========== STARTING AUTOFILL =========="
    );


    const processedGroups =
        new Set();


    for (
        const field of fields
    ) {

        if (
            field.type === "file"
        ) {

            continue;
        }


        const groupKey =
            (
                field.type === "radio" ||
                field.type === "checkbox"
            ) &&
            field.name
                ? `${field.type}:${field.name}`
                : null;


        if (
            groupKey &&
            processedGroups.has(groupKey)
        ) {

            continue;
        }


        const profileValue =
            getProfileValue(
                field
            );


        if (
            !profileValue ||
            profileValue.value === undefined ||
            profileValue.value === null
        ) {

            console.log(
                `SKIP #${field.index}: ${field.question}`
            );

            continue;
        }


        console.log(
            `\nMATCH #${field.index}`
        );

        console.log(
            "Question:",
            field.question
        );

        console.log(
            "Value:",
            profileValue.value
        );

        console.log(
            "Source:",
            profileValue.source
        );


        let success = false;


        // --------------------------------------------------
        // TEXT
        // --------------------------------------------------

        if (
            field.type === "text" ||
            field.type === "email" ||
            field.type === "tel" ||
            field.type === "textarea"
        ) {

            success =
                await fillTextField(
                    page,
                    field,
                    profileValue.value
                );
        }


        // --------------------------------------------------
        // SELECT
        // --------------------------------------------------

        else if (
            field.type === "select"
        ) {

            success =
                await fillSelect(
                    page,
                    field,
                    profileValue.value
                );
        }


        // --------------------------------------------------
        // RADIO
        // --------------------------------------------------

        else if (
            field.type === "radio"
        ) {

            success =
                await fillRadio(
                    page,
                    field,
                    profileValue.value,
                    fields
                );


            if (groupKey) {
                processedGroups.add(
                    groupKey
                );
            }
        }


        // --------------------------------------------------
        // CHECKBOX
        // --------------------------------------------------

        else if (
            field.type === "checkbox"
        ) {

            success =
                await fillCheckbox(
                    page,
                    field,
                    profileValue.value,
                    fields
                );


            if (groupKey) {
                processedGroups.add(
                    groupKey
                );
            }
        }


        else {

            console.log(
                "UNSUPPORTED TYPE:",
                field.type
            );
        }


        if (!success) {

            console.log(
                "⚠️ FIELD NOT FILLED"
            );
        }
    }


    console.log(
        "\n========== AUTOFILL COMPLETE =========="
    );
};


// ==================================================
// MAIN
// ==================================================

const startApplicationAgent = async (
    jobUrl
) => {

    console.log(
        "Starting JobPilot..."
    );


    console.log(
        `Opening: ${jobUrl}`
    );


    // ==================================================
    // 1. BROWSER
    // ==================================================
    context =
        await chromium.launchPersistentContext(
            userDataDir,
            {
                headless: false,
                slowMo: 300
            }
        );


    page =
        await context.newPage();


    // ==================================================
    // 2. OPEN JOB APPLICATION
    // ==================================================

    await page.goto(
        jobUrl,
        {
            waitUntil:
                "domcontentloaded"
        }
    );


    console.log(
        "Initial page:",
        page.url()
    );


    // ==================================================
    // 3. LOGIN
    // ==================================================

    if (
        page.url().includes("/login")
    ) {

        console.log(
            "\n========== LOGIN REQUIRED =========="
        );


        console.log(
            "Please log in manually."
        );


        console.log(
            "JobPilot is PAUSED until login is complete..."
        );


        await page.waitForURL(
            url =>
                !url.toString().includes(
                    "/login"
                ),
            {
                timeout: 300000
            }
        );


        console.log(
            "\n========== LOGIN DETECTED =========="
        );


        console.log(
            "Current URL:",
            page.url()
        );
    }


    // ==================================================
    // 4. WAIT FOR APPLICATION
    // ==================================================

    await waitForApplicationUI(
        page
    );


    // ==================================================
    // 5. DEBUG UI
    // ==================================================

    await inspectInteractiveElements(
        page
    );


    // ==================================================
    // 6. EXPAND ACCORDIONS
    // ==================================================

    await expandAllAccordions(
        page
    );


    // ==================================================
    // 7. WAIT FOR DYNAMIC FIELDS
    // ==================================================

    await page.waitForTimeout(
        2000
    );


    // ==================================================
    // 8. DEBUG AGAIN
    // ==================================================

    await inspectInteractiveElements(
        page
    );


    // ==================================================
    // 9. PAGE COUNTS
    // ==================================================

    const inputCount =
        await page
            .locator("input")
            .count();


    const textareaCount =
        await page
            .locator("textarea")
            .count();


    const selectCount =
        await page
            .locator("select")
            .count();


    const buttonCount =
        await page
            .locator("button")
            .count();


    console.log(
        "\n========== PAGE ELEMENTS =========="
    );


    console.log(
        "Inputs:    ",
        inputCount
    );


    console.log(
        "Textareas: ",
        textareaCount
    );


    console.log(
        "Selects:   ",
        selectCount
    );


    console.log(
        "Buttons:   ",
        buttonCount
    );


    console.log(
        "==================================="
    );


    // ==================================================
    // 10. EXTRACT FIELDS
    // ==================================================

    const applicationFields =
        await extractApplicationFields(
            page
        );


    // ==================================================
    // 11. PRINT FIELDS
    // ==================================================

    printApplicationFields(
        applicationFields
    );


    // ==================================================
    // 12. APPLICATION JSON
    // ==================================================

    const normalizedApplication = {

        job: {

            url:
                jobUrl,

            title:
                await page.title()
        },

        fields:
            applicationFields
    };


    console.log(
        "\n========== APPLICATION JSON =========="
    );


    console.log(
        JSON.stringify(
            normalizedApplication,
            null,
            2
        )
    );


    console.log(
        "\n======================================"
    );


    // ==================================================
    // 13. RESUME
    // ==================================================

    await uploadResume(
        page
    );


    // Resume upload can cause additional
    // fields to appear/change.
    await page.waitForTimeout(
        2000
    );


    // ==================================================
    // 14. RE-EXPAND ACCORDIONS
    // ==================================================

    await expandAllAccordions(
        page
    );


    // ==================================================
    // 15. RE-EXTRACT FIELDS
    // ==================================================

    const finalFields =
        await extractApplicationFields(
            page
        );


    console.log(
        "\n========== FINAL FIELD COUNT =========="
    );


    console.log(
        finalFields.length
    );


    // ==================================================
    // 16. AUTOFILL
    // ==================================================

    await fillApplicationFields(
        page,
        finalFields
    );


    // ==================================================
    // 17. KEEP BROWSER OPEN
    // ==================================================

    console.log(
        "\n======================================"
    );


    console.log(
        "Browser will remain open for inspection."
    );


    console.log(
        "======================================"
    );


    return normalizedApplication;
};

const stopApplicationAgent = async () => {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
    }
};

// ==================================================
// EXPORT
// ==================================================

module.exports = {
    startApplicationAgent,
    stopApplicationAgent
};