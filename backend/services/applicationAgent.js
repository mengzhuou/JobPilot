const { chromium } = require("playwright");
const profile = require("./profile.json");
const path = require("path");
const {
    normalizeText,
    getAvailableFormOption,
    getBooleanFormAnswer
} = require("./applicationAgentUtils");
const {
    inspectInteractiveElements,
    printApplicationFields
} = require("./applicationAgentDebug");

let context = null;
let page = null;
let pageMonitor = null;
let monitorBusy = false;
let lastFormSignature = null;

const resumePath = path.resolve(
    __dirname,
    "./Mengzhu Ou_Resume.pdf"
);

const userDataDir = path.resolve(
    __dirname,
    "./playwright-profile"
);


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
    // CANDIDATE ACCOUNT
    // --------------------------------------------------

    if (
        field.type === "password" &&
        (
            question.includes("password") ||
            name.includes("password") ||
            id.includes("password")
        )
    ) {

        return {
            value:
                process.env.APPLICATION_PASSWORD,
            source:
                "environment.APPLICATION_PASSWORD",
            sensitive: true
        };
    }


    if (
        question === "login" ||
        question === "username" ||
        question === "user name" ||
        name === "login" ||
        name.includes("username") ||
        id === "login" ||
        id.includes("username")
    ) {

        return {
            value:
                process.env.APPLICATION_USERNAME,
            source:
                "environment.APPLICATION_USERNAME",
            sensitive: true
        };
    }


    // --------------------------------------------------
    // NAME
    // --------------------------------------------------

    if (
        question.includes("first name") ||
        question.includes("given name")
    ) {

        return {
            value: profile.candidate.first_name,
            source: "candidate.first_name"
        };
    }

    if (
        question.includes("last name") ||
        question.includes("family name") ||
        question.includes("surname")
    ) {

        return {
            value: profile.candidate.last_name,
            source: "candidate.last_name"
        };
    }

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
        question === "address" ||
        question === "street address" ||
        question === "address line 1" ||
        question === "address 1"
    ) {

        return {
            value: profile.candidate.location.address_line_1,
            source: "candidate.location.address_line_1"
        };
    }

    if (
        question === "city" ||
        question === "current city" ||
        question === "city of residence"
    ) {

        return {
            value: profile.candidate.location.city,
            source: "candidate.location.city"
        };
    }

    if (
        question === "state" ||
        question === "state province" ||
        question === "state or province" ||
        question === "province"
    ) {

        return {
            value: profile.candidate.location.state,
            source: "candidate.location.state"
        };
    }

    if (
        question === "location" ||
        question === "current location"
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
            value: "Job Board",

            source: "application_answers.referral_category"
        };
    }


    if (
        question.includes("please specify further")
    ) {

        return {
            value:
                profile.application_answers
                    ?.how_heard_about_company,
            source:
                "application_answers.how_heard_about_company"
        };
    }


    // --------------------------------------------------
    // SCHOOL
    // --------------------------------------------------

    if (
        question === "school" ||
        question === "school or university" ||
        question === "university"
    ) {

        return {
            value: profile.education?.school,
            source: "education.school"
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
    // WORK AUTHORIZATION / SPONSORSHIP
    // --------------------------------------------------

    if (
        question.includes("legally authorized to work") ||
        question.includes("legal authorization to work")
    ) {

        return {
            value:
                profile.work_authorization
                    ?.authorized_to_work_without_sponsorship,
            source:
                "work_authorization.authorized_to_work_without_sponsorship"
        };
    }

    if (
        question.includes("require sponsorship") ||
        question.includes("employment visa sponsorship")
    ) {

        return {
            value:
                !profile.work_authorization
                    ?.authorized_to_work_without_sponsorship,
            source:
                "work_authorization.authorized_to_work_without_sponsorship (inverted)"
        };
    }


    // --------------------------------------------------
    // EXPERIENCE / EDUCATION / ROLE PREFERENCES
    // --------------------------------------------------

    const workHistory =
        profile.career
            ?.work_history || [];


    if (
        question === "job title" &&
        Number.isInteger(field.workExperienceIndex)
    ) {

        return {
            value:
                workHistory[field.workExperienceIndex]
                    ?.job_title,
            source:
                `career.work_history[${field.workExperienceIndex}].job_title`
        };
    }

    if (
        question === "company" &&
        Number.isInteger(field.workExperienceIndex)
    ) {

        return {
            value:
                workHistory[field.workExperienceIndex]
                    ?.company,
            source:
                `career.work_history[${field.workExperienceIndex}].company`
        };
    }

    if (
        question === "from" &&
        Number.isInteger(field.workExperienceIndex)
    ) {

        return {
            value:
                workHistory[field.workExperienceIndex]
                    ?.from,
            source:
                `career.work_history[${field.workExperienceIndex}].from`
        };
    }

    if (
        question === "to" &&
        Number.isInteger(field.completedWorkExperienceIndex)
    ) {

        const completedWork =
            workHistory.filter(
                experience => !experience.current
            );


        return {
            value:
                completedWork[field.completedWorkExperienceIndex]
                    ?.to,
            source:
                `career.work_history completed[${field.completedWorkExperienceIndex}].to`
        };
    }

    if (
        question.includes("currently work here") ||
        question.includes("current job") ||
        question.includes("current employer")
    ) {

        return {
            value:
                workHistory[field.workExperienceIndex]
                    ?.current,
            source:
                `career.work_history[${field.workExperienceIndex}].current`
        };
    }

    if (
        question.includes("years of relevant work experience") ||
        question.includes("years of relevant experience")
    ) {

        const years =
            profile.experience
                ?.total_professional_software_engineering_years;


        return {
            value:
                years >= 4
                    ? "4+ years"
                    : years >= 2
                        ? "2-3 years"
                        : "0-1 year",
            source:
                "experience.total_professional_software_engineering_years"
        };
    }

    if (
        question.includes("highest level of education") ||
        question.includes("highest degree obtained") ||
        question.includes("highest degree completed")
    ) {

        return {
            value:
                getAvailableFormOption(
                    field,
                    profile.education
                        ?.highest_level_form_options
                ),
            source:
                "education.highest_level_form_options"
        };
    }


    if (
        question === "degree"
    ) {

        return {
            value: "Bachelor’s Degree",
            source: "education.highest_level"
        };
    }

    if (
        question.includes("currently pursuing further education")
    ) {

        return {
            value:
                profile.education
                    ?.currently_pursuing_further_education,
            source:
                "education.currently_pursuing_further_education"
        };
    }

    if (
        question.includes("applying for an internship") ||
        question.includes("applying for internship") ||
        question.includes("internship coop")
    ) {

        return {
            value:
                profile.job_preferences
                    ?.applying_for_internship_or_coop,
            source:
                "job_preferences.applying_for_internship_or_coop"
        };
    }

    if (
        question.includes("earliest date you could start") ||
        question.includes("earliest start date")
    ) {

        return {
            value:
                profile.job_preferences
                    ?.earliest_start_date,
            source:
                "job_preferences.earliest_start_date"
        };
    }

    if (
        question.includes("applying for a fulltime role") ||
        question.includes("applying for fulltime")
    ) {

        return {
            value:
                profile.job_preferences
                    ?.applying_for_full_time,
            source:
                "job_preferences.applying_for_full_time"
        };
    }

    if (
        question.includes("available to go to the office") ||
        question.includes("days per week in the office")
    ) {

        return {
            value:
                profile.job_preferences
                    ?.office_days_per_week_form_option,
            source:
                "job_preferences.office_days_per_week_form_option"
        };
    }


    // --------------------------------------------------
    // GENDER
    // --------------------------------------------------

    if (
        name.includes("gender") ||
        id.includes("gender") ||
        question === "gender" ||
        question.includes("select your gender")
    ) {

        return {
            value:
                getAvailableFormOption(
                    field,
                    profile.eeoc
                        ?.gender
                        ?.form_options
                ),

            source:
                "eeoc.gender.form_options"
        };
    }


    // --------------------------------------------------
    // RACE
    // --------------------------------------------------

    if (
        name.includes("race") ||
        id.includes("race") ||
        question === "race" ||
        question.includes("raceethnicity") ||
        question.includes("race ethnicity")
    ) {

        return {
            value:
                getAvailableFormOption(
                    field,
                    profile.eeoc
                        ?.race
                        ?.form_options
                ),

            source:
                "eeoc.race.form_options"
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
                getAvailableFormOption(
                    field,
                    profile.eeoc
                        ?.veteran_status
                        ?.form_options
                ),

            source:
                "eeoc.veteran_status.form_options"
        };
    }


    // --------------------------------------------------
    // DISABILITY
    // --------------------------------------------------

    if (
        field.type === "radio" &&
        (
            name.includes("disability") ||
            id.includes("disability") ||
            question.includes("disability") ||
            question.includes("disabled individual")
        )
    ) {

        return {
            value:
                profile.eeoc
                    ?.disability_status
                    ?.has_disability,
            source:
                "eeoc.disability_status.has_disability"
        };
    }


    // --------------------------------------------------
    // NO MATCH
    // --------------------------------------------------

    return null;
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
// APPLICATION FRAME
// ==================================================

const getVisibleApplicationControlCount = async scope => {

    return scope.locator(
        "input, textarea, select"
    ).evaluateAll(elements =>
        elements.filter(element => {
            const type = (element.type || "").toLowerCase();

            return (
                element.getClientRects().length > 0 &&
                !element.disabled &&
                ![
                    "hidden",
                    "button",
                    "submit",
                    "reset",
                    "search"
                ].includes(type)
            );
        }).length
    );
};


const findApplicationScope = async (
    page,
    timeout = 15000,
    logDiagnostics = true
) => {

    const deadline = Date.now() + timeout;
    let bestScope = page;
    let bestCount = 0;
    let diagnostics = [];

    do {
        diagnostics = [];
        bestScope = page;
        bestCount = 0;

        for (const [index, frame] of page.frames().entries()) {
            try {
                const count =
                    await getVisibleApplicationControlCount(frame);

                diagnostics.push({
                    index,
                    main: frame === page.mainFrame(),
                    name: frame.name() || null,
                    url: frame.url(),
                    visibleApplicationControls: count
                });

                if (count > bestCount) {
                    bestScope = frame;
                    bestCount = count;
                }
            } catch (error) {
                diagnostics.push({
                    index,
                    main: frame === page.mainFrame(),
                    name: frame.name() || null,
                    url: frame.url(),
                    visibleApplicationControls: 0,
                    error: error.message
                });
            }
        }

        if (bestCount > 0 || Date.now() >= deadline) {
            break;
        }

        await page.waitForTimeout(500);
    } while (!page.isClosed());

    if (logDiagnostics) {
        console.log(
            "\n========== APPLICATION FRAME SELECTION =========="
        );
        console.log(JSON.stringify(diagnostics, null, 2));
        console.log(
            bestScope === page
                ? `Using main page (${bestCount} visible application controls).`
                : `Using iframe: ${bestScope.url()} (${bestCount} visible application controls).`
        );
        console.log(
            "================================================="
        );
    }

    return bestScope;
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

                                value:
                                    element.value,

                                checked:
                                    Boolean(element.checked),

                                visible:
                                    Boolean(
                                        element.getClientRects().length
                                    ),

                                disabled:
                                    Boolean(element.disabled),

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
                field.disabled ||
                [
                    "hidden",
                    "button",
                    "submit",
                    "reset"
                ].includes(field.type)
            ) {
                return false;
            }


            if (
                !field.visible &&
                field.type !== "file" &&
                field.type !== "select"
            ) {
                return false;
            }

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

        const formValue =
            field.type === "month"
                ? String(value).slice(0, 7)
                : String(value);

        await locator
            .first()
            .scrollIntoViewIfNeeded();


        if (field.type === "password") {
            await locator.first().click();
            await locator.first().fill("");
            await locator.first().pressSequentially(
                formValue,
                {
                    delay: 25
                }
            );
            await locator.first().press("Tab");
        } else {
            await locator
                .first()
                .fill(
                    formValue
                );
        }


        console.log(
            "FILLED:",
            field.type === "password"
                ? "[REDACTED]"
                : value
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
// FILL DATE / MONTH FIELD
// ==================================================

const fillDateField = async (
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


    const match =
        String(value).match(
            /^(\d{4})-(\d{2})(?:-(\d{2}))?$/
        );


    if (!match) {
        return fillTextField(
            page,
            field,
            value
        );
    }


    const [, year, month, day = "01"] = match;
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr",
        "May", "Jun", "Jul", "Aug",
        "Sep", "Oct", "Nov", "Dec"
    ];
    const monthName =
        monthNames[Number(month) - 1];


    try {

        if (field.type === "date") {

            await locator.first().fill(
                `${year}-${month}-${day}`
            );

            console.log(
                "FILLED DATE:",
                `${year}-${month}-${day}`
            );

            return true;
        }


        if (field.type === "month") {

            await locator.first().fill(
                `${year}-${month}`
            );

            console.log(
                "FILLED MONTH:",
                `${year}-${month}`
            );

            return true;
        }


        // Custom month/year picker: open it, choose a year
        // from the visible select, then click the month.
        await page.keyboard.press("Escape")
            .catch(() => {});
        await locator.first().scrollIntoViewIfNeeded();
        await locator.first().click();
        await page.waitForTimeout(200);


        const selects =
            page.locator("select");
        const selectCount =
            await selects.count();
        let yearSelected = false;


        for (let i = selectCount - 1; i >= 0; i--) {

            const select = selects.nth(i);


            if (
                !(await select.isVisible().catch(() => false))
            ) {
                continue;
            }


            const options =
                await select.locator("option")
                    .allTextContents();


            if (
                options.some(
                    option => option.trim() === year
                )
            ) {

                await select.selectOption({
                    label: year
                });
                yearSelected = true;
                break;
            }
        }


        const monthCandidates =
            page.getByText(
                monthName,
                { exact: true }
            );
        const monthCount =
            await monthCandidates.count();
        let monthSelected = false;


        for (let i = monthCount - 1; i >= 0; i--) {

            const candidate =
                monthCandidates.nth(i);


            if (
                await candidate.isVisible()
                    .catch(() => false)
            ) {

                await candidate.click({
                    force: true
                });
                monthSelected = true;
                break;
            }
        }


        await page.keyboard.press("Escape")
            .catch(() => {});


        if (
            yearSelected &&
            monthSelected
        ) {

            console.log(
                "SELECTED MONTH:",
                `${monthName} ${year}`
            );

            return true;
        }


        // Text-backed month controls commonly accept MM/YYYY.
        await locator.first().fill(
            `${month}/${year}`
        );
        await locator.first().press("Tab");


        console.log(
            "FILLED MONTH TEXT:",
            `${month}/${year}`
        );


        return true;

    } catch (error) {

        await page.keyboard.press("Escape")
            .catch(() => {});


        console.log(
            "DATE FILL ERROR:",
            error.message
        );


        return false;
    }
};


// ==================================================
// FILL SELECT
// ==================================================

const fillAutocompleteSelect = async (
    page,
    locator,
    field,
    value
) => {

    const triggerCandidates = [];


    if (field.id) {
        triggerCandidates.push(
            page.locator(
                `[id="${field.id}_icimsDropdown"]`
            ),
            page.locator(
                `[id="${field.id}_chosen"]`
            ),
            page.locator(
                `[id="select2-${field.id}-container"]`
            )
        );
    }


    triggerCandidates.push(
        locator.first().locator(
            "xpath=following-sibling::*[1]"
        ),
        locator.first().locator(
            "xpath=parent::*"
        ).locator(
            '.chosen-container, .select2-container, [role="combobox"]'
        )
    );


    let opened = false;


    const canonicalizeOptionText = text =>
        normalizeText(text)
            .replace(/[\u2018\u2019\u02bc]/g, "'");


    const selectVisibleCanonicalOption = async () => {
        const expected = canonicalizeOptionText(value);
        const options = page.locator(
            `
            [role="option"],
            .chosen-results li,
            .select2-results__option,
            .ui-menu-item,
            [class*="option"]
            `
        );
        const count = await options.count();


        for (let i = 0; i < count; i++) {
            const option = options.nth(i);


            if (
                !(await option.isVisible()
                    .catch(() => false))
            ) {
                continue;
            }


            const text =
                await option.innerText()
                    .catch(() => "");


            if (
                canonicalizeOptionText(text) !== expected
            ) {
                continue;
            }


            await option.click({
                force: true
            });
            await page.waitForTimeout(100);


            const selectedValue =
                await locator.first().evaluate(
                    element => String(element.value || "").trim()
                ).catch(() => "");


            if (selectedValue) {
                console.log(
                    "CUSTOM CANONICAL OPTION SELECTED:",
                    text.trim()
                );

                return true;
            }
        }


        return false;
    };


    for (const candidate of triggerCandidates) {
        if (
            await candidate.first().isVisible()
                .catch(() => false)
        ) {
            await candidate.first().scrollIntoViewIfNeeded();
            await candidate.first().click({
                force: true
            });
            opened = true;


            console.log(
                "CUSTOM DROPDOWN CLICKED:",
                field.question
            );

            break;
        }
    }


    if (!opened) {
        return false;
    }


    await page.waitForTimeout(150);


    // Non-searchable enhanced controls (such as iCIMS Degree)
    // expose their choices only after the field has been clicked.
    if (
        await selectVisibleCanonicalOption()
    ) {
        return true;
    }


    const searchInputs =
        page.locator(
            `
            .chosen-search input,
            .select2-search input,
            [role="listbox"] input,
            input[type="search"],
            input[placeholder*="Type to Search" i]
            `
        );


    const searchCount =
        await searchInputs.count();
    let searchInput = null;


    for (let i = searchCount - 1; i >= 0; i--) {
        const candidate = searchInputs.nth(i);

        if (
            await candidate.isVisible()
                .catch(() => false)
        ) {
            searchInput = candidate;
            break;
        }
    }


    if (!searchInput) {
        console.log(
            "AUTOCOMPLETE SEARCH INPUT NOT FOUND"
        );
        return false;
    }


    await searchInput.click({
        force: true
    });
    await searchInput.fill("");
    await searchInput.pressSequentially(
        String(value),
        {
            delay: 35
        }
    );


    console.log(
        "AUTOCOMPLETE TYPED:",
        value
    );


    const exactTextOptions =
        page.getByText(
            String(value),
            { exact: true }
        );


    const autocompleteIsAddress =
        normalizeText(field.question) === "address" ||
        normalizeText(field.question).includes("street address");


    const deadline =
        Date.now() +
        (autocompleteIsAddress ? 800 : 5000);


    const selectionCommitted = async () => {
        await page.waitForTimeout(100);

        const selectedValue =
            await locator.first().evaluate(
                element => String(element.value || "").trim()
            ).catch(() => "");

        return selectedValue !== "";
    };


    while (Date.now() < deadline) {
        const exactCount =
            await exactTextOptions.count();


        for (let i = 0; i < exactCount; i++) {
            const option = exactTextOptions.nth(i);


            if (
                await option.isVisible()
                    .catch(() => false)
            ) {
                await option.click({
                    force: true
                });

                if (await selectionCommitted()) {
                    console.log(
                        "AUTOCOMPLETE SELECTED:",
                        value
                    );

                    return true;
                }

                console.log(
                    "AUTOCOMPLETE CLICK DID NOT COMMIT SELECTION"
                );
            }
        }


        await page.waitForTimeout(150);
    }


    const optionCandidates =
        page.locator(
            `
            [role="option"],
            .chosen-results li,
            .select2-results__option
            `
        );


    const optionCount =
        await optionCandidates.count();


    for (let i = 0; i < optionCount; i++) {
        const option = optionCandidates.nth(i);


        if (
            !(await option.isVisible()
                .catch(() => false))
        ) {
            continue;
        }


        const text =
            await option.innerText()
                .catch(() => "");


        const normalizedText = normalizeText(text);
        const normalizedValue = normalizeText(value);
        if (
            normalizedText === normalizedValue ||
            (
                autocompleteIsAddress &&
                normalizedText.includes(normalizedValue)
            )
        ) {
            await option.click({
                force: true
            });

            if (await selectionCommitted()) {
                console.log(
                    "AUTOCOMPLETE SELECTED:",
                    text.trim()
                );

                return true;
            }
        }
    }


    await searchInput.press("Escape")
        .catch(() => {});


    return false;
};


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


        const answer =
            getBooleanFormAnswer(
                value,
                options
            );


        const normalizedValue =
            normalizeText(answer);


        const matchingOption =
            options.find(
                option =>
                    normalizeText(option) ===
                    normalizedValue
            );


        if (!matchingOption) {

            console.log(
                `No loaded native option for "${value}"; trying autocomplete.`
            );

            return fillAutocompleteSelect(
                page,
                locator,
                field,
                value
            );
        }


        await locator
            .first()
            .selectOption({
                label: matchingOption
            }, {
                force: true
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
                        candidate.label ||
                        candidate.question
                    ) === normalizedAnswer
                );
            }
        );


    if (!matchingField) {

        const labelledOptions =
            page.getByLabel(
                String(answer),
                { exact: true }
            );
        const labelledCount =
            await labelledOptions.count();


        for (let i = 0; i < labelledCount; i++) {

            const option =
                labelledOptions.nth(i);


            if (
                await option.isVisible()
                    .catch(() => false)
            ) {

                await option.check({
                    force: true
                });

                console.log(
                    "CHECKED RADIO BY LABEL:",
                    answer
                );

                return true;
            }
        }

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


    // Repeated work-history fields often have identical
    // labels. Assign each occurrence to its corresponding
    // profile record before looking up answers.
    const workFieldIndexes = {
        "job title": 0,
        company: 0,
        from: 0,
        to: 0,
        current: 0
    };


    fields.forEach(field => {

        const question =
            normalizeText(
                field.question ||
                field.label ||
                ""
            );


        if (
            question === "job title" ||
            question === "company" ||
            question === "from"
        ) {

            field.workExperienceIndex =
                workFieldIndexes[question]++;
        }


        if (question === "to") {
            field.completedWorkExperienceIndex =
                workFieldIndexes.to++;
        }


        if (
            question.includes("currently work here") ||
            question.includes("current job") ||
            question.includes("current employer")
        ) {

            field.workExperienceIndex =
                workFieldIndexes.current++;
        }
    });


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


        // Preserve values already supplied by the user,
        // resume parsing, or an earlier autofill pass.
        const currentValue =
            String(field.value || "").trim();


        const hasValidDateValue =
            field.type === "date"
                ? /^\d{4}-\d{2}-\d{2}$/.test(currentValue)
                : field.type === "month"
                    ? /^\d{4}-\d{2}$/.test(currentValue)
                    : currentValue !== "";


        const hasTextValue =
            (
                field.type === "text" ||
                field.type === "password" ||
                field.type === "email" ||
                field.type === "tel" ||
                field.type === "date" ||
                field.type === "month" ||
                field.type === "textarea"
            ) &&
            hasValidDateValue;


        const hasSelectValue =
            field.type === "select" &&
            String(field.value || "").trim() !== "" &&
            ![
                "please select",
                "select",
                "choose",
                "make a selection"
            ].includes(
                normalizeText(field.value)
            ) &&
            !normalizeText(field.value)
                .includes("make a selection");


        const groupHasSelection =
            (
                field.type === "radio" ||
                field.type === "checkbox"
            ) &&
            fields.some(
                candidate =>
                    candidate.type === field.type &&
                    candidate.name === field.name &&
                    candidate.checked
            );


        const falseCheckboxIsAnswered =
            field.type === "checkbox" &&
            profileValue.value === false;


        const isProfileWorkHistoryField =
            Number.isInteger(
                field.workExperienceIndex
            ) ||
            Number.isInteger(
                field.completedWorkExperienceIndex
            );


        const shouldOverrideExisting =
            normalizeText(field.question)
                .includes("how did you hear about") ||
            normalizeText(field.question)
                .includes("how did you first hear");


        if (
            !isProfileWorkHistoryField &&
            !shouldOverrideExisting &&
            (
                hasTextValue ||
                hasSelectValue ||
                groupHasSelection ||
                falseCheckboxIsAnswered
            )
        ) {

            console.log(
                `KEEP EXISTING #${field.index}: ${field.question}`
            );

            if (groupKey) {
                processedGroups.add(groupKey);
            }

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
            profileValue.sensitive
                ? "[REDACTED]"
                : profileValue.value
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
            field.type === "password" ||
            field.type === "email" ||
            field.type === "tel" ||
            field.type === "date" ||
            field.type === "month" ||
            field.type === "textarea"
        ) {

            const normalizedQuestion =
                normalizeText(
                    field.question ||
                    field.label ||
                    ""
                );


            const usesDatePicker =
                field.type === "date" ||
                field.type === "month" ||
                normalizedQuestion === "from" ||
                normalizedQuestion === "to";


            success = usesDatePicker
                ? await fillDateField(
                    page,
                    field,
                    profileValue.value
                )
                : await fillTextField(
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
// MULTI-PAGE APPLICATION MONITOR
// ==================================================

const getFormSignature = async page => {

    return page.locator(
        "input, textarea, select"
    ).evaluateAll(elements => {

        const fields = elements.map(element => {

            const label =
                element.labels && element.labels.length
                    ? element.labels[0].innerText
                    : element.getAttribute("aria-label") || "";


            const options =
                element.tagName === "SELECT"
                    ? Array.from(element.options)
                        .map(option => option.textContent.trim())
                        .join("|")
                    : "";


            return [
                element.tagName,
                element.getAttribute("type") || "",
                element.getAttribute("name") || "",
                element.id || "",
                label.replace(/\s+/g, " ").trim(),
                options
            ].join("|");
        });


        return `${location.href}::${fields.join("::")}`;
    });
};


const startMultiPageMonitor = async (
    page,
    initialScope,
    initialSignature = null,
    onSubmissionConfirmed = null
) => {

    let submitClicked = false;


    const installSubmitListener = () => {

        if (window.__jobPilotSubmitListenerInstalled) {
            return;
        }


        window.__jobPilotSubmitListenerInstalled = true;


        document.addEventListener(
            "click",
            event => {

                const control =
                    event.target.closest(
                        'button, input[type="submit"], [role="button"]'
                    );


                if (!control) {
                    return;
                }


                const label =
                    (
                        control.innerText ||
                        control.value ||
                        control.getAttribute("aria-label") ||
                        ""
                    )
                        .replace(/\s+/g, " ")
                        .trim()
                        .toLowerCase();


                if (
                    label === "submit" ||
                    label.includes("submit application")
                ) {
                    window.__jobPilotNotifySubmitClick();
                }
            },
            true
        );
    };


    await page.exposeFunction(
        "__jobPilotNotifySubmitClick",
        () => {
            submitClicked = true;
            console.log(
                "Submit clicked; waiting for application confirmation."
            );
        }
    );


    await page.addInitScript(
        installSubmitListener
    );


    await page.evaluate(
        installSubmitListener
    );


    if (initialScope !== page) {
        await initialScope.evaluate(
            installSubmitListener
        ).catch(() => {});
    }

    if (pageMonitor) {
        clearInterval(pageMonitor);
    }


    lastFormSignature =
        initialSignature ||
        await getFormSignature(initialScope)
            .catch(() => null);


    pageMonitor = setInterval(
        async () => {

            if (
                monitorBusy ||
                page.isClosed()
            ) {
                return;
            }


            monitorBusy = true;


            try {

                const applicationScope =
                    await findApplicationScope(
                        page,
                        0,
                        false
                    );

                if (submitClicked) {

                    let submissionConfirmed = false;


                    for (const frame of page.frames()) {
                        const confirmed =
                            await frame.evaluate(() => {

                                const text =
                                    document.body
                                        ?.innerText
                                        ?.toLowerCase() || "";


                                const successText = [
                                    "successfully applied",
                                    "application submitted",
                                    "application has been submitted",
                                    "thank you for applying",
                                    "thanks for applying"
                                ].some(
                                    phrase => text.includes(phrase)
                                );


                                const successUrl =
                                    /success|confirmation|thank[-_]?you/i
                                        .test(location.href);


                                return successText || successUrl;
                            }).catch(() => false);


                        if (confirmed) {
                            submissionConfirmed = true;
                            break;
                        }
                    }


                    if (submissionConfirmed) {

                        console.log(
                            "Application submission confirmed. Closing the tab."
                        );

                        if (onSubmissionConfirmed) {
                            await onSubmissionConfirmed().catch(error => {
                                console.log(
                                    "Could not save application history:",
                                    error.message
                                );
                            });
                        }


                        await page.waitForTimeout(1000);
                        await page.close();
                        return;
                    }
                }

                const signature =
                    await getFormSignature(applicationScope);


                if (
                    !signature ||
                    signature === lastFormSignature
                ) {
                    return;
                }


                // Record first so changes caused by this fill pass
                // can trigger one more pass for conditional fields.
                lastFormSignature = signature;


                console.log(
                    "\n========== NEW APPLICATION STEP DETECTED =========="
                );


                await page.waitForTimeout(750);


                const fields =
                    await extractApplicationFields(
                        applicationScope
                    );


                await fillApplicationFields(
                    applicationScope,
                    fields
                );

            } catch (error) {

                if (!page.isClosed()) {
                    console.log(
                        "Application step monitor error:",
                        error.message
                    );
                }

            } finally {
                monitorBusy = false;
            }
        },
        1200
    );


    console.log(
        "Multi-page monitoring is active. Navigate with Next and new fields will be filled automatically."
    );
};


// ==================================================
// MAIN
// ==================================================

const closeApplicationSession = async (
    targetContext = context
) => {

    if (pageMonitor) {
        clearInterval(pageMonitor);
        pageMonitor = null;
    }


    monitorBusy = false;
    lastFormSignature = null;


    if (!targetContext) {
        page = null;
        return;
    }


    if (context === targetContext) {
        context = null;
        page = null;
    }


    await targetContext.close()
        .catch(error => {
            console.log(
                "Browser context cleanup:",
                error.message
            );
        });
};

const startApplicationAgent = async (
    jobUrl,
    options = {}
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
    // A closed tab can leave its persistent context alive.
    // Always release it before reusing the same profile.
    await closeApplicationSession();


    const launchedContext =
        await chromium.launchPersistentContext(
            userDataDir,
            {
                headless: false,
                slowMo: 300
            }
        );


    context = launchedContext;


    // Persistent contexts already open an initial page.
    // Reuse it instead of leaving a hidden blank tab alive.
    const existingPages =
        launchedContext.pages();


    const launchedPage =
        existingPages[0] ||
        await launchedContext.newPage();


    page = launchedPage;


    launchedPage.once("close", () => {

        if (page !== launchedPage) {
            return;
        }


        void closeApplicationSession(
            launchedContext
        );
    });


    launchedContext.once("close", () => {

        if (context === launchedContext) {
            context = null;
            page = null;
        }
    });


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


    const applicationScope =
        await findApplicationScope(
            page
        );


    // ==================================================
    // 5. DEBUG UI
    // ==================================================

    await inspectInteractiveElements(
        applicationScope
    );


    // ==================================================
    // 6. EXPAND ACCORDIONS
    // ==================================================

    await expandAllAccordions(
        applicationScope
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
        applicationScope
    );


    // ==================================================
    // 9. PAGE COUNTS
    // ==================================================

    const inputCount =
        await applicationScope
            .locator("input")
            .count();


    const textareaCount =
        await applicationScope
            .locator("textarea")
            .count();


    const selectCount =
        await applicationScope
            .locator("select")
            .count();


    const buttonCount =
        await applicationScope
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
            applicationScope
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
        applicationScope
    );


    // Resume upload can cause additional
    // fields to appear/change.
    await page.waitForTimeout(
        2000
    );


    // ==================================================
    // 14. RE-EXTRACT FIELDS
    // ==================================================

    // Do not expand accordions again here. Resume uploads
    // commonly trigger the career site to autofill fields,
    // and another expansion pass needlessly clicks through
    // sections that have already been discovered.

    const finalFields =
        await extractApplicationFields(
            applicationScope
        );


    console.log(
        "\n========== FINAL FIELD COUNT =========="
    );


    console.log(
        finalFields.length
    );


    // ==================================================
    // 15. AUTOFILL
    // ==================================================

    const signatureBeforeAutofill =
        await getFormSignature(applicationScope)
            .catch(() => null);


    await fillApplicationFields(
        applicationScope,
        finalFields
    );


    // Watch for Next/Continue navigation and conditional
    // fields that appear after answers are selected.
    await startMultiPageMonitor(
        page,
        applicationScope,
        signatureBeforeAutofill,
        options.onSubmissionConfirmed
    );


    // ==================================================
    // 16. KEEP BROWSER OPEN
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
    await closeApplicationSession();
};


const isApplicationAgentRunning = () => {
    return Boolean(
        context &&
        page &&
        !page.isClosed()
    );
};

// ==================================================
// EXPORT
// ==================================================

module.exports = {
    startApplicationAgent,
    stopApplicationAgent,
    isApplicationAgentRunning
};
