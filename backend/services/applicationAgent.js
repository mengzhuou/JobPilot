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


        await locator
            .first()
            .fill(
                formValue
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
                "choose"
            ].includes(
                normalizeText(field.value)
            );


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


        if (
            !isProfileWorkHistoryField &&
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
    initialSignature = null
) => {

    if (pageMonitor) {
        clearInterval(pageMonitor);
    }


    lastFormSignature =
        initialSignature ||
        await getFormSignature(page)
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

                const signature =
                    await getFormSignature(page);


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
                    await extractApplicationFields(page);


                await fillApplicationFields(
                    page,
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


    page.once("close", () => {

        if (pageMonitor) {
            clearInterval(pageMonitor);
            pageMonitor = null;
        }


        monitorBusy = false;
        lastFormSignature = null;
        page = null;
    });


    context.once("close", () => {
        context = null;
        page = null;
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
    // 14. RE-EXTRACT FIELDS
    // ==================================================

    // Do not expand accordions again here. Resume uploads
    // commonly trigger the career site to autofill fields,
    // and another expansion pass needlessly clicks through
    // sections that have already been discovered.

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
    // 15. AUTOFILL
    // ==================================================

    const signatureBeforeAutofill =
        await getFormSignature(page)
            .catch(() => null);


    await fillApplicationFields(
        page,
        finalFields
    );


    // Watch for Next/Continue navigation and conditional
    // fields that appear after answers are selected.
    await startMultiPageMonitor(
        page,
        signatureBeforeAutofill
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

    if (pageMonitor) {
        clearInterval(pageMonitor);
        pageMonitor = null;
    }


    monitorBusy = false;
    lastFormSignature = null;


    if (context) {
        await context.close();
        context = null;
        page = null;
    }
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
