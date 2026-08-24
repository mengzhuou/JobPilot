const { chromium } = require("playwright");
const profile = require("./profile.json");


// ==================================================
// HELPER FUNCTIONS
// ==================================================

const normalizeText = (text) => {

    if (!text) {
        return "";
    }

    return text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
};


// ==================================================
// GET VALUE FROM PROFILE.JSON
// ==================================================

const getProfileValue = (field) => {

    const question = normalizeText(
        field.question || field.label || ""
    );

    const name = normalizeText(
        field.name || ""
    );

    const id = normalizeText(
        field.id || ""
    );


    // --------------------------------------------------
    // NAME
    // --------------------------------------------------

    if (
        name === "_systemfield_name" ||
        id === "_systemfield_name" ||
        question === "name" ||
        question.includes("full name")
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
        question.includes("phone")
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
        question === "current location"
    ) {

        return {
            value:
                `${profile.candidate.location.city}, ${profile.candidate.location.state}`,

            source: "candidate.location"
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
    // HOW DID YOU HEAR ABOUT GIVEBUTTER?
    // --------------------------------------------------

    if (
        question.includes(
            "how did you first hear about givebutter"
        )
    ) {

        return {
            value:
                profile.application_answers
                    .givebutter
                    .how_heard_about_company,

            source:
                "application_answers.givebutter.how_heard_about_company"
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
                    .us_citizen_or_permanent_resident,

            source:
                "work_authorization.us_citizen_or_permanent_resident"
        };
    }


    // --------------------------------------------------
    // GENDER
    // --------------------------------------------------

    if (
        name.includes(
            "__systemfield_eeoc_gender"
        ) ||
        id.includes(
            "__systemfield_eeoc_gender"
        )
    ) {

        return {
            value:
                profile.eeoc.gender.form_option,

            source:
                "eeoc.gender.form_option"
        };
    }


    // --------------------------------------------------
    // RACE
    // --------------------------------------------------

    if (
        name.includes(
            "__systemfield_eeoc_race"
        ) ||
        id.includes(
            "__systemfield_eeoc_race"
        )
    ) {

        return {
            value:
                profile.eeoc.race.form_option,

            source:
                "eeoc.race.form_option"
        };
    }


    // --------------------------------------------------
    // VETERAN STATUS
    // --------------------------------------------------

    if (
        name.includes(
            "__systemfield_eeoc_veteran_status"
        ) ||
        id.includes(
            "__systemfield_eeoc_veteran_status"
        )
    ) {

        return {
            value:
                profile.eeoc.veteran_status.form_option,

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
// FILL APPLICATION FIELDS
// ==================================================

const fillApplicationFields = async (
    page,
    fields
) => {

    console.log(
        "\n========== STARTING AUTOFILL =========="
    );


    for (const field of fields) {

        const profileValue =
            getProfileValue(field);


        // --------------------------------------------------
        // NO PROFILE MATCH
        // --------------------------------------------------

        if (!profileValue) {

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


        // --------------------------------------------------
        // FILE INPUT
        // --------------------------------------------------

        if (
            field.type === "file"
        ) {

            console.log(
                "SKIP FILE:",
                field.question
            );

            continue;
        }


        // --------------------------------------------------
        // RADIO BUTTON
        // --------------------------------------------------

        if (
            field.type === "radio"
        ) {

            // Only select the radio whose label
            // matches the profile answer.

            const fieldLabel =
                normalizeText(field.label);

            const profileAnswer =
                normalizeText(
                    profileValue.value
                );


            if (
                fieldLabel === profileAnswer
            ) {

                if (!field.id) {

                    console.log(
                        "SKIP RADIO: missing ID"
                    );

                    continue;
                }


                const locator =
                    page.locator(
                        `#${CSS.escape(field.id)}`
                    );


                await locator.check();


                console.log(
                    "CHECKED RADIO:",
                    field.label
                );
            }


            continue;
        }


        // --------------------------------------------------
        // CHECKBOX
        // --------------------------------------------------

        if (
            field.type === "checkbox"
        ) {

            const fieldLabel =
                normalizeText(field.label);

            const profileAnswer =
                normalizeText(
                    profileValue.value
                );


            // Only check when we have an explicit
            // matching answer.

            if (
                fieldLabel === profileAnswer
            ) {

                if (!field.id) {

                    console.log(
                        "SKIP CHECKBOX: missing ID"
                    );

                    continue;
                }


                const locator =
                    page.locator(
                        `#${CSS.escape(field.id)}`
                    );


                await locator.check();


                console.log(
                    "CHECKED CHECKBOX:",
                    field.label
                );
            }


            continue;
        }


        // --------------------------------------------------
        // TEXT / EMAIL / TEL / TEXTAREA
        // --------------------------------------------------

        if (
            field.type === "text" ||
            field.type === "email" ||
            field.type === "tel" ||
            field.type === "textarea" ||
            field.type === null
        ) {

            let locator = null;


            // ----------------------------------------------
            // Prefer ID
            // ----------------------------------------------

            if (
                field.id
            ) {

                locator =
                    page.locator(
                        `#${CSS.escape(field.id)}`
                    );
            }


            // ----------------------------------------------
            // Otherwise use NAME
            // ----------------------------------------------

            else if (
                field.name
            ) {

                locator =
                    page.locator(
                        `[name="${CSS.escape(field.name)}"]`
                    );
            }


            // ----------------------------------------------
            // Fill
            // ----------------------------------------------

            if (
                locator
            ) {

                await locator.fill(
                    String(
                        profileValue.value
                    )
                );


                console.log(
                    "FILLED:",
                    profileValue.value
                );

            } else {

                console.log(
                    "SKIP: Could not locate field"
                );
            }


            continue;
        }


        // --------------------------------------------------
        // UNSUPPORTED FIELD TYPE
        // --------------------------------------------------

        console.log(
            "UNSUPPORTED TYPE:",
            field.type
        );
    }


    console.log(
        "\n========== AUTOFILL COMPLETE =========="
    );
};


// ==================================================
// MAIN APPLICATION AGENT
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


    // --------------------------------------------------
    // 1. LAUNCH BROWSER
    // --------------------------------------------------

    const browser =
        await chromium.launch({

            headless: false,

            slowMo: 300
        });


    const page =
        await browser.newPage();


    // --------------------------------------------------
    // 2. OPEN APPLICATION
    // --------------------------------------------------

    await page.goto(
        jobUrl,
        {
            waitUntil: "networkidle"
        }
    );


    console.log(
        "Job application opened."
    );


    // Give dynamically rendered content
    // time to appear.

    await page.waitForTimeout(
        3000
    );


    console.log(
        "\nInspecting page..."
    );


    console.log(
        "Page title:",
        await page.title()
    );


    console.log(
        "Current URL:",
        page.url()
    );


    // ==================================================
    // 3. BASIC PAGE INFORMATION
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
        "===================================\n"
    );


    // ==================================================
    // 4. EXTRACT FORM FIELDS
    // ==================================================

    const fields =
        await page
            .locator(
                "input, textarea, select"
            )
            .evaluateAll(
                (elements) => {

                    return elements.map(
                        (element, index) => {


                            // ----------------------------------
                            // Helper
                            // ----------------------------------

                            const cleanText =
                                (text) => {

                                    if (!text) {
                                        return null;
                                    }


                                    return text
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim();
                                };


                            // ----------------------------------
                            // Find label
                            // ----------------------------------

                            let label =
                                null;


                            if (
                                element.id
                            ) {

                                const labelElement =
                                    document
                                        .querySelector(
                                            `label[for="${CSS.escape(
                                                element.id
                                            )}"]`
                                        );


                                if (
                                    labelElement
                                ) {

                                    label =
                                        cleanText(
                                            labelElement
                                                .innerText
                                        );
                                }
                            }


                            // ----------------------------------
                            // Parent label
                            // ----------------------------------

                            if (
                                !label
                            ) {

                                const parentLabel =
                                    element.closest(
                                        "label"
                                    );


                                if (
                                    parentLabel
                                ) {

                                    label =
                                        cleanText(
                                            parentLabel
                                                .innerText
                                        );
                                }
                            }


                            // ----------------------------------
                            // Find nearby question
                            // ----------------------------------

                            let question =
                                label;


                            if (
                                !question
                            ) {

                                let current =
                                    element
                                        .parentElement;


                                for (
                                    let i = 0;
                                    i < 6 &&
                                    current;
                                    i++
                                ) {

                                    const text =
                                        cleanText(
                                            current
                                                .innerText
                                        );


                                    if (
                                        text
                                    ) {

                                        const placeholder =
                                            element
                                                .getAttribute(
                                                    "placeholder"
                                                );


                                        let candidateText =
                                            text;


                                        if (
                                            placeholder
                                        ) {

                                            candidateText =
                                                candidateText
                                                    .replace(
                                                        placeholder,
                                                        ""
                                                    )
                                                    .trim();
                                        }


                                        if (
                                            candidateText &&
                                            candidateText.length < 300
                                        ) {

                                            question =
                                                candidateText;

                                            break;
                                        }
                                    }


                                    current =
                                        current.parentElement;
                                }
                            }


                            // ----------------------------------
                            // Get options
                            // ----------------------------------

                            let options =
                                [];


                            const type =
                                element.getAttribute(
                                    "type"
                                );


                            if (
                                type === "radio" ||
                                type === "checkbox"
                            ) {

                                const container =
                                    element.closest(
                                        "label"
                                    ) ||
                                    element.parentElement;


                                if (
                                    container
                                ) {

                                    const text =
                                        cleanText(
                                            container
                                                .innerText
                                        );


                                    if (
                                        text
                                    ) {

                                        options.push(
                                            text
                                        );
                                    }
                                }
                            }


                            // ----------------------------------
                            // Find related radio/checkbox options
                            // ----------------------------------

                            if (
                                type === "radio" ||
                                type === "checkbox"
                            ) {

                                const name =
                                    element.getAttribute(
                                        "name"
                                    );


                                if (
                                    name
                                ) {

                                    const relatedElements =
                                        document
                                            .querySelectorAll(
                                                `input[name="${CSS.escape(
                                                    name
                                                )}"]`
                                            );


                                    options =
                                        Array.from(
                                            relatedElements
                                        )
                                            .map(
                                                (
                                                    relatedElement
                                                ) => {

                                                    let optionText =
                                                        null;


                                                    // label[for]
                                                    if (
                                                        relatedElement.id
                                                    ) {

                                                        const optionLabel =
                                                            document
                                                                .querySelector(
                                                                    `label[for="${CSS.escape(
                                                                        relatedElement.id
                                                                    )}"]`
                                                                );


                                                        if (
                                                            optionLabel
                                                        ) {

                                                            optionText =
                                                                cleanText(
                                                                    optionLabel
                                                                        .innerText
                                                                );
                                                        }
                                                    }


                                                    // Parent label
                                                    if (
                                                        !optionText
                                                    ) {

                                                        const parentLabel =
                                                            relatedElement
                                                                .closest(
                                                                    "label"
                                                                );


                                                        if (
                                                            parentLabel
                                                        ) {

                                                            optionText =
                                                                cleanText(
                                                                    parentLabel
                                                                        .innerText
                                                                );
                                                        }
                                                    }


                                                    return optionText;

                                                }
                                            )
                                            .filter(
                                                Boolean
                                            );
                                }
                            }


                            // Remove duplicates
                            options =
                                [
                                    ...new Set(
                                        options
                                    )
                                ];


                            // ----------------------------------
                            // Determine field type
                            // ----------------------------------

                            let fieldType =
                                type;


                            if (
                                element
                                    .tagName
                                    .toLowerCase() ===
                                "textarea"
                            ) {

                                fieldType =
                                    "textarea";
                            }


                            if (
                                element
                                    .tagName
                                    .toLowerCase() ===
                                "select"
                            ) {

                                fieldType =
                                    "select";
                            }


                            // ----------------------------------
                            // System field detection
                            // ----------------------------------

                            const name =
                                element.getAttribute(
                                    "name"
                                );


                            const id =
                                element.getAttribute(
                                    "id"
                                );


                            let systemField =
                                false;


                            if (
                                name &&
                                name.startsWith(
                                    "_systemfield_"
                                )
                            ) {

                                systemField =
                                    true;
                            }


                            if (
                                id &&
                                id.startsWith(
                                    "_systemfield_"
                                )
                            ) {

                                systemField =
                                    true;
                            }


                            // ----------------------------------
                            // Return normalized field
                            // ----------------------------------

                            return {

                                index,

                                tag:
                                    element
                                        .tagName
                                        .toLowerCase(),

                                type:
                                    fieldType,

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

                                label,

                                question,

                                options,

                                systemField
                            };
                        }
                    );
                }
            );


    // ==================================================
    // 5. REMOVE RECAPTCHA / INTERNAL FIELDS
    // ==================================================

    const applicationFields =
        fields.filter(
            (field) => {

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


    // ==================================================
    // 6. PRINT NORMALIZED FORM FIELDS
    // ==================================================

    console.log(
        "\n========== NORMALIZED FORM FIELDS =========="
    );


    applicationFields.forEach(
        (field) => {

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
                field.options.length > 0
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


    // ==================================================
    // 7. CREATE APPLICATION SCHEMA
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


    // ==================================================
    // 8. PRINT APPLICATION JSON
    // ==================================================

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
    // 9. AUTOFILL APPLICATION
    // ==================================================

    await fillApplicationFields(
        page,
        applicationFields
    );


    // ==================================================
    // 10. KEEP BROWSER OPEN
    // ==================================================

    console.log(
        "\nBrowser will remain open for inspection."
    );


    return normalizedApplication;
};


// ==================================================
// EXPORT
// ==================================================

module.exports = {
    startApplicationAgent
};