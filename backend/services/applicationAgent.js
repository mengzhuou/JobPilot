const { chromium } = require("playwright");
const profile = require("./profile.json");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const {
    normalizeText,
    getAvailableFormOption,
    getBooleanFormAnswer
} = require("./applicationAgentUtils");
const {
    inspectInteractiveElements,
    printApplicationFields
} = require("./applicationAgentDebug");
const {
    SITE_TYPES,
    detectApplicationSite,
    getApplicationPageIdentity,
} = require("./applicationSiteAdapters");

let context = null;
let page = null;
let pageMonitor = null;
let monitorBusy = false;
let lastFormSignature = null;
let resumeUploaded = false;
let externalProfileImported = false;
let resumePath = null;
let resumeDirectory = null;

const userDataDir = path.resolve(
    __dirname,
    "./playwright-profile"
);

const resumeExtension = fileName => {
    const extension = path.extname(fileName || "").toLowerCase();
    return [".pdf", ".doc", ".docx"].includes(extension) ? extension : ".pdf";
};

const safeResumeFileName = resume => {
    const savedName = String(resume.display_name || "primary-resume")
        .replace(/[\\/:*?"<>|\r\n]+/g, "_")
        .trim()
        .slice(0, 180) || "primary-resume";
    return `${savedName}${resumeExtension(resume.file_name)}`;
};

const clearSelectedResume = async () => {
    resumePath = null;
    if (!resumeDirectory) return;
    const directory = resumeDirectory;
    resumeDirectory = null;
    await fs.rm(directory, { recursive: true, force: true }).catch(error => {
        console.log("Temporary résumé cleanup:", error.message);
    });
};

const prepareSelectedResume = async resume => {
    if (!resume?.file_data) {
        throw Object.assign(new Error("Choose a primary résumé in Resumes before starting Autofill."), { statusCode: 400 });
    }
    await clearSelectedResume();
    resumeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "jobpilot-resume-"));
    resumePath = path.join(resumeDirectory, safeResumeFileName(resume));
    await fs.writeFile(resumePath, resume.file_data);
};

const QUESTION_STOP_WORDS = new Set(["a", "an", "and", "are", "do", "have", "how", "is", "of", "or", "the", "to", "us", "what", "where", "you", "your"]);
const QUESTION_TOKEN_ALIASES = {
    authorised: "authorization", authorized: "authorization", authorization: "authorization",
    eligible: "authorization", eligibility: "authorization", right: "authorization",
    employed: "work", employment: "work", worked: "work", working: "work",
    developed: "build", created: "build", built: "build", building: "build",
    relocation: "relocate", relocating: "relocate", commute: "commuting",
    applications: "application", roles: "role", tools: "tool",
    requires: "require", required: "require", requirements: "require",
};
const questionTokens = value => new Set(normalizeText(value).split(" ")
    .filter(token => token.length > 2 && !QUESTION_STOP_WORDS.has(token))
    .map(token => QUESTION_TOKEN_ALIASES[token] || token));
const questionSimilarity = (left, right) => {
    const leftTokens = questionTokens(left);
    const rightTokens = questionTokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    const overlap = [...leftTokens].filter(token => rightTokens.has(token)).length;
    if (overlap < 2 && Math.min(leftTokens.size, rightTokens.size) > 1) return 0;
    const dice = (2 * overlap) / (leftTokens.size + rightTokens.size);
    const containment = overlap / Math.min(leftTokens.size, rightTokens.size);
    return Math.max(dice, containment * 0.86);
};
const getCuratedQuestionAnswer = question => {
    let bestMatch = null;
    Object.entries(profile.Q_and_A || {}).forEach(([key, item]) => {
        (item.questions || []).forEach(candidate => {
            const normalizedCandidate = normalizeText(candidate);
            const exact = question === normalizedCandidate || question.includes(normalizedCandidate) || normalizedCandidate.includes(question);
            const score = exact ? 1 : questionSimilarity(question, normalizedCandidate);
            if (!bestMatch || score > bestMatch.score) bestMatch = { key, answer: item.answer, score };
        });
    });
    return bestMatch && bestMatch.score >= 0.64 ? bestMatch : null;
};


// ==================================================
// PROFILE VALUE
// ==================================================

const getProfileValue = (field, siteAdapter = { type: SITE_TYPES.GENERIC }) => {

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

    const phoneDigits = String(profile.candidate.phone || "").replace(/\D/g, "");
    const phoneFieldHint = normalizeText([
        question,
        field.placeholder,
        field.ariaLabel,
        name,
        id,
    ].filter(Boolean).join(" "));

    if (phoneFieldHint.includes("country code")) {
        return {
            value: getAvailableFormOption(field, [
                "United States (+1)",
                "United States +1",
                "US (+1)",
                "+1",
                "United States",
            ]) || "+1",
            source: "candidate.phone_country_code"
        };
    }

    if (phoneFieldHint.includes("area code")) {
        return {
            value: phoneDigits.slice(0, 3),
            source: "candidate.phone_area_code"
        };
    }

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
        question === "city of residence" ||
        question === "location city"
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
                question === "location" && profile.application_answers?.preferred_application_location
                    ? profile.application_answers.preferred_application_location
                    : `${profile.candidate.location.city}, ${profile.candidate.location.state}`,

            source:
                question === "location" && profile.application_answers?.preferred_application_location
                    ? "application_answers.preferred_application_location"
                    : "candidate.location"
        };
    }

    if (question === "country" || question === "country region") {
        return { value: profile.candidate.location.country, source: "candidate.location.country" };
    }


    // --------------------------------------------------
    // LINKEDIN
    // --------------------------------------------------

    if (
        question.includes("url") &&
        (
            question.includes("portfolio") ||
            question.includes("github") ||
            question.includes("linkedin")
        )
    ) {
        return {
            value:
                profile.candidate.links.portfolio ||
                profile.candidate.links.github ||
                profile.candidate.links.linkedin,
            source: "candidate.links.portfolio"
        };
    }

    if (
        question === "other website" ||
        question.includes("other website")
    ) {
        return {
            value: profile.candidate.links.portfolio,
            source: "candidate.links.portfolio"
        };
    }

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
            value: profile.application_answers?.referral_category || "Careers site",

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
        question.includes("legal authorization to work") ||
        question.includes("currently authorized to work") ||
        question.includes("right to work in the united states")
    ) {

        const booleanOptions = (field.options || []).map(normalizeText);
        const usesYesNo = booleanOptions.includes("yes") && booleanOptions.includes("no");
        const greenhouseBooleanControl = siteAdapter.type === SITE_TYPES.GREENHOUSE
            && (field.role === "combobox" || field.ariaAutocomplete === "list");

        return {
            value: usesYesNo || field.ashbyYesNo || greenhouseBooleanControl
                ? profile.work_authorization?.authorized_to_work_without_sponsorship
                : getAvailableFormOption(
                    field,
                    profile.work_authorization?.authorized_to_work_form_options
                ),
            source:
                usesYesNo || field.ashbyYesNo || greenhouseBooleanControl
                    ? "work_authorization.authorized_to_work_without_sponsorship"
                    : "work_authorization.authorized_to_work_form_options"
        };
    }


    if (
        question.includes("currently based in the us") ||
        question.includes("currently based in the united states")
    ) {

        return {
            value: normalizeText(profile.candidate?.location?.country).includes("united states"),
            source: "candidate.location.country"
        };
    }


    if (question.includes("citizenship status")) {

        return {
            value: getAvailableFormOption(
                field,
                profile.work_authorization?.citizenship_status_form_options
            ),
            source: "work_authorization.citizenship_status_form_options"
        };
    }


    if (
        question.includes("essential functions") &&
        question.includes("reasonable accommodation")
    ) {

        return {
            value: profile.application_answers?.can_perform_essential_functions,
            source: "application_answers.can_perform_essential_functions"
        };
    }


    if (
        siteAdapter.spacexQuestions &&
        question.includes("spacex") &&
        question.includes("employment history")
    ) {

        return {
            value: getAvailableFormOption(
                field,
                profile.application_answers?.spacex_employment_history_form_options
            ),
            source: "application_answers.spacex_employment_history_form_options"
        };
    }

    if (
        question.includes("require sponsorship") ||
        question.includes("immigration sponsorship") ||
        question.includes("employment visa sponsorship") ||
        (
            question.includes("sponsorship") &&
            question.includes("immigration support")
        )
    ) {

        return {
            value:
                !profile.work_authorization
                    ?.authorized_to_work_without_sponsorship,
            source:
                "work_authorization.authorized_to_work_without_sponsorship (inverted)"
        };
    }


    if (
        question.includes("keep your application for 12 months") ||
        question.includes("retain your application for future roles")
    ) {

        return {
            value: profile.application_answers?.retain_application_for_future_roles,
            source: "application_answers.retain_application_for_future_roles"
        };
    }


    if (
        question.includes("currently employed by one of ubers subsidiaries") ||
        question.includes("currently employed by an uber subsidiary")
    ) {

        return {
            value: profile.application_answers?.currently_employed_by_uber_subsidiary,
            source: "application_answers.currently_employed_by_uber_subsidiary"
        };
    }


    if (question.includes("open to being considered for other roles")) {

        return {
            value: profile.application_answers?.open_to_other_roles,
            source: "application_answers.open_to_other_roles"
        };
    }


    if (
        question.includes("been a driver") ||
        question.includes("delivered with uber eats") ||
        question.includes("delivered with uber freight")
    ) {

        return {
            value: profile.application_answers?.uber_driver_or_delivery_partner,
            source: "application_answers.uber_driver_or_delivery_partner"
        };
    }


    if (question.includes("ever been employed by uber")) {

        return {
            value: profile.application_answers?.previously_employed_by_uber,
            source: "application_answers.previously_employed_by_uber"
        };
    }


    if (
        question.includes("comfortable working onsite") &&
        (question.includes("days a week") || question.includes("days per week"))
    ) {

        return {
            value: true,
            source: "job_preferences.office_days_per_week_form_option"
        };
    }


    // --------------------------------------------------
    // EXPERIENCE / EDUCATION / ROLE PREFERENCES
    // --------------------------------------------------

    const workHistory =
        profile.career
            ?.work_history || [];

    if (
        question.includes("current or most recent company") ||
        question.includes("current most recent company") ||
        question.includes("name of your current company")
    ) {
        return {
            value: profile.career?.current_company,
            source: "career.current_company"
        };
    }


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
            value: "Bachelor",
            source: "education.highest_level"
        };
    }

    if (
        question === "discipline" ||
        question.includes("field of study") ||
        question.includes("area of study")
    ) {

        return {
            value: profile.education?.field_of_study,
            source: "education.field_of_study"
        };
    }

    if (question.includes("gpa undergraduate") || question.includes("undergraduate gpa")) {
        return { value: profile.education?.undergraduate_gpa, source: "education.undergraduate_gpa" };
    }
    if (question.includes("gpa graduate") || question.includes("graduate gpa")) {
        return { value: profile.education?.graduate_gpa, source: "education.graduate_gpa" };
    }
    if (question.includes("gpa doctorate") || question.includes("doctorate gpa")) {
        return { value: profile.education?.doctorate_gpa, source: "education.doctorate_gpa" };
    }
    if (question.includes("sat score")) return { value: profile.education?.sat_score, source: "education.sat_score" };
    if (question.includes("act score")) return { value: profile.education?.act_score, source: "education.act_score" };
    if (question.includes("gre score")) return { value: profile.education?.gre_score, source: "education.gre_score" };
    if (question.includes("active security clearance")) return { value: profile.application_answers?.active_security_clearance, source: "application_answers.active_security_clearance" };

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
        question.includes("gender identity") ||
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

    if (/race or national origin option [2-9]/.test(question)) {
        return null;
    }

    if (
        name.includes("race") ||
        id.includes("race") ||
        question === "race" ||
        question.includes("ethnicity") ||
        question.includes("ethnicities") ||
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
    // SEXUAL ORIENTATION / TRANSGENDER STATUS
    // --------------------------------------------------

    if (question.includes("sexual orientation")) {
        return {
            value: getAvailableFormOption(
                field,
                profile.eeoc?.sexual_orientation?.form_options
            ) || profile.eeoc?.sexual_orientation?.answer,
            source: "eeoc.sexual_orientation.form_options"
        };
    }

    if (question.includes("transgender experience") || question.includes("transgender")) {
        return {
            value: getAvailableFormOption(
                field,
                profile.eeoc?.transgender_status?.form_options
            ) || profile.eeoc?.transgender_status?.is_transgender,
            source: "eeoc.transgender_status.form_options"
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

        if (
            siteAdapter.type === SITE_TYPES.GREENHOUSE &&
            (
                question.includes("served in the military") ||
                question.includes("have you served")
            )
        ) {
            return {
                value: false,
                source: "eeoc.veteran_status.answer"
            };
        }

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
    // NETFLIX-SPECIFIC APPLICATION / EEOC QUESTIONS
    // --------------------------------------------------

    if (siteAdapter.netflixQuestions) {
        const orientationOptions = [
            "asexual", "bisexual", "gay", "heterosexual", "lesbian",
            "pansexual", "queer", "not listed", "i choose not to disclose",
        ];
        const isOrientationOption = orientationOptions.some(option =>
            question === option || question.endsWith(` ${option}`)
        );

        if (field.type === "checkbox" && isOrientationOption) {
            return {
                value: profile.eeoc?.sexual_orientation?.answer,
                source: "eeoc.sexual_orientation.form_options"
            };
        }

        if (question.includes("currently working for netflix") && question.includes("contractor")) {
            return {
                value: profile.application_answers?.currently_working_for_netflix_as_contractor,
                source: "application_answers.currently_working_for_netflix_as_contractor"
            };
        }

        if (question.includes("worked for netflix") && question.includes("past")) {
            return {
                value: profile.application_answers?.previously_worked_for_netflix,
                source: "application_answers.previously_worked_for_netflix"
            };
        }
    }

    if (
        question.includes("by selecting i agree") ||
        (
            question.includes("candidate privacy policy") &&
            question.includes("agree")
        )
    ) {
        return {
            value: getAvailableFormOption(field, ["I agree", "Agree", "Yes"]),
            source: "autofill_policy.candidate_privacy_acknowledgement"
        };
    }

    if (
        question.includes("by checking this box") &&
        question.includes("i consent")
    ) {
        return {
            value: true,
            source: "autofill_policy.demographic_data_consent"
        };
    }


    // --------------------------------------------------
    // DISABILITY
    // --------------------------------------------------

    if (
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


    const curatedAnswer = getCuratedQuestionAnswer(question);
    if (curatedAnswer) {
        return { value: curatedAnswer.answer, source: `Q_and_A.${curatedAnswer.key}` };
    }

    // --------------------------------------------------
    // NO MATCH
    // --------------------------------------------------

    return null;
};


// ==================================================
// WAIT FOR APPLICATION UI
// ==================================================

const APPLY_ACTION_NAME = /^(?:apply|apply now|apply for this job|apply to this job|start application)$/i;

const hasVisibleApplicationFields = async targetPage => {
    const controls = targetPage.locator(
        'input:not([type="hidden"]):not([type="search"]), textarea, select'
    );
    const count = await controls.count();
    let visibleCount = 0;
    for (let index = 0; index < Math.min(count, 4); index += 1) {
        if (await controls.nth(index).isVisible().catch(() => false)) visibleCount += 1;
    }
    return visibleCount >= 2 || await targetPage.locator('input[type="file"]').first().isVisible().catch(() => false);
};

const openApplicationForm = async (targetPage, targetContext) => {
    if (await hasVisibleApplicationFields(targetPage)) return targetPage;

    for (const frame of targetPage.frames()) {
        const candidates = [
            frame.getByRole("button", { name: APPLY_ACTION_NAME }),
            frame.getByRole("link", { name: APPLY_ACTION_NAME }),
        ];

        for (const candidateGroup of candidates) {
            const candidateCount = await candidateGroup.count().catch(() => 0);
            for (let index = 0; index < candidateCount; index += 1) {
                const candidate = candidateGroup.nth(index);
                const actionable = await candidate.isVisible().catch(() => false)
                    && await candidate.isEnabled().catch(() => false);
                if (!actionable) continue;

                const pagesBeforeClick = new Set(targetContext.pages());
                const previousUrl = targetPage.url();
                const label = (await candidate.innerText().catch(() => "Apply")).trim() || "Apply";
                console.log(`Opening application form via "${label}".`);
                await candidate.click({ timeout: 10000 });
                await targetPage.waitForTimeout(800).catch(() => {});

                const popup = targetContext.pages().find(openPage => !pagesBeforeClick.has(openPage));
                const applicationPage = popup || targetPage;
                await applicationPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
                await applicationPage.waitForTimeout(700).catch(() => {});
                console.log(
                    popup ? "Application opened in a new tab:" : previousUrl !== applicationPage.url() ? "Application page:" : "Application form opened:",
                    applicationPage.url()
                );
                return applicationPage;
            }
        }
    }

    console.log("No separate Apply action was needed or found.");
    return targetPage;
};

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

const extractApplicationFields = async (
    page,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {

    console.log(
        "\n========== EXTRACTING FORM FIELDS =========="
    );


    const fields =
        await page
            .locator(
                "input, textarea, select"
            )
            .evaluateAll(
                (elements, siteType) => {

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
                                element.tagName.toLowerCase() === "input"
                                    ? rawType || "text"
                                    : rawType;


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


                            // Some career sites (including Oracle Candidate
                            // Experience) render editable inputs without an id
                            // or name. Give every extracted element a stable
                            // locator for the duration of this autofill pass.
                            const locatorKey =
                                `jobpilot-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;


                            element.setAttribute(
                                "data-jobpilot-field-key",
                                locatorKey
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


                            const ashbyYesNoContainer = siteType === "ashby"
                                ? element.closest(".ashby-application-form-input-yesno")
                                : null;


                            return {

                                index,

                                tag:
                                    element.tagName
                                        .toLowerCase(),

                                type,

                                name,

                                id,

                                locatorKey,

                                placeholder:
                                    element.getAttribute(
                                        "placeholder"
                                    ),

                                required:
                                    element.hasAttribute("required") ||
                                    element.getAttribute("aria-required") === "true",

                                ariaLabel:
                                    element.getAttribute(
                                        "aria-label"
                                    ),

                                role:
                                    element.getAttribute("role"),

                                ariaAutocomplete:
                                    element.getAttribute("aria-autocomplete"),

                                label:
                                    getLabelFor(id),

                                question,

                                value:
                                    element.value,

                                checked:
                                    Boolean(element.checked),

                                ashbyYesNo:
                                    Boolean(ashbyYesNoContainer),

                                ashbySelectedOption:
                                    ashbyYesNoContainer
                                        ?.querySelector('[data-option][aria-pressed="true"]')
                                        ?.getAttribute("data-option") || null,

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
                },
                siteAdapter.type
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
                (
                    field.type !== "select" ||
                    siteAdapter.type === SITE_TYPES.GREENHOUSE
                )
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


    if (resumeUploaded) {

        console.log(
            "Resume was already uploaded in this application session."
        );

        return true;
    }


    if (externalProfileImported) {

        console.log(
            "Keeping the resume imported by the career site's autofill."
        );

        resumeUploaded = true;
        return true;
    }

    if (!resumePath) {

        console.log(
            "No primary résumé is selected for this Autofill session."
        );

        return false;
    }


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


        resumeUploaded = true;


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

    if (field.locatorKey) {

        return page.locator(
            `[data-jobpilot-field-key="${field.locatorKey}"]`
        );
    }

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

        const answerValue = typeof value === "boolean"
            ? getBooleanFormAnswer(value, ["Yes", "No"])
            : value;


        const formValue =
            field.type === "month"
                ? String(answerValue).slice(0, 7)
                : String(answerValue);

        await locator
            .first()
            .scrollIntoViewIfNeeded();

        if (field.role === "combobox" || field.ariaAutocomplete === "list") {
            await locator.first().click({ force: true });
            await locator.first().fill("");
            await locator.first().pressSequentially(formValue, { delay: 35 });
            await page.waitForTimeout(250);

            const expected = normalizeText(formValue);
            const normalizedQuestion = normalizeText(field.question || field.label || "");
            const allowPartialOptionMatch =
                normalizedQuestion.includes("location") ||
                normalizedQuestion.includes("city") ||
                normalizedQuestion.includes("address");
            const options = page.locator('[role="option"]');
            const optionCount = await options.count();
            for (let index = 0; index < optionCount; index++) {
                const option = options.nth(index);
                if (!(await option.isVisible().catch(() => false))) continue;
                const optionText = await option.innerText().catch(() => "");
                const normalizedOption = normalizeText(optionText);
                if (
                    normalizedOption === expected ||
                    (allowPartialOptionMatch && normalizedOption.includes(expected))
                ) {
                    await option.click({ force: true });
                    console.log("COMBOBOX SELECTED:", optionText.trim());
                    return true;
                }
            }
            console.log("COMBOBOX EXACT OPTION NOT FOUND:", formValue);
            return false;
        }


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
    fields,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {

    if (
        typeof value === "boolean"
    ) {

        const input = getFieldLocator(page, field);
        if (input && siteAdapter.ashbyYesNo) {
            const ashbyEntry = input.first().locator("xpath=ancestor::*[@data-field-path][1]");
            const ashbyOption = ashbyEntry.locator(`[data-option="${value ? "yes" : "no"}"]`);
            if (await ashbyOption.count() && await ashbyOption.first().isVisible().catch(() => false)) {
                await ashbyOption.first().click({ force: true });
                console.log("SELECTED ASHBY YES/NO:", value ? "Yes" : "No");
                return true;
            }
        }

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


const getLiveFieldState = async (
    applicationScope,
    field,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {
    const locator = getFieldLocator(applicationScope, field);
    if (!locator) return null;

    return locator.first().evaluate((element, siteType) => {
        const name = element.getAttribute("name");
        const fieldContainerSelector = siteType === "ashby"
            ? "[data-field-path], .ashby-application-form-field-entry"
            : ".field, .field-entry, fieldset, [role='group']";
        const fieldContainer = element.closest(fieldContainerSelector) || element.parentElement;
        const ashbyContainer = siteType === "ashby"
            ? element.closest(".ashby-application-form-input-yesno")
            : null;
        const customSelection = fieldContainer?.querySelector([
            '[aria-selected="true"]',
            '[aria-checked="true"]',
            '[aria-pressed="true"]',
            '[class*="singleValue"]',
            '[class*="multiValue"]',
            '[class*="selected-value"]',
        ].join(", "));

        return {
            value: element.value,
            checked: Boolean(element.checked),
            groupChecked: Boolean(name && Array.from(document.getElementsByName(name))
                .some(candidate => Boolean(candidate.checked))),
            ashbySelectedOption: ashbyContainer
                ?.querySelector('[data-option][aria-pressed="true"]')
                ?.getAttribute("data-option") || null,
            customHasSelection: Boolean(customSelection),
        };
    }, siteAdapter.type).catch(() => null);
};


// ==================================================
// FILL APPLICATION
// ==================================================

const fillApplicationFields = async (
    page,
    fields,
    siteAdapter = { type: SITE_TYPES.GENERIC }
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
                field,
                siteAdapter
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


        // Greenhouse and other importers can populate fields after the
        // extraction snapshot. Re-read this exact control immediately before
        // deciding whether it is safe to fill.
        const liveState = await getLiveFieldState(page, field, siteAdapter);


        // Preserve values already supplied by the user,
        // resume parsing, an external importer, or an earlier autofill pass.
        const currentValue =
            String(liveState?.value ?? field.value ?? "").trim();


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
            (Boolean(liveState?.groupChecked) || fields.some(
                candidate =>
                    candidate.type === field.type &&
                    candidate.name === field.name &&
                    candidate.checked
            ));


        const ashbyHasSelection =
            field.ashbyYesNo &&
            Boolean(liveState?.ashbySelectedOption || field.ashbySelectedOption);


        const customControlHasSelection =
            Boolean(liveState?.customHasSelection);


        const falseCheckboxIsAnswered =
            field.type === "checkbox" &&
            profileValue.value === false &&
            !field.ashbyYesNo;


        if (
            (
                hasTextValue ||
                hasSelectValue ||
                groupHasSelection ||
                ashbyHasSelection ||
                customControlHasSelection ||
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
                    fields,
                    siteAdapter
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


const fillCustomRadioGroups = async (
    applicationScope,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {
    if (!siteAdapter.oracleRadioPills) return;
    const groups = applicationScope.locator('[role="radiogroup"]');
    const groupCount = await groups.count().catch(() => 0);

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
        const group = groups.nth(groupIndex);
        if (!await group.isVisible().catch(() => false)) continue;

        const question = await group.evaluate(element => {
            const ariaLabel = element.getAttribute("aria-label");
            if (ariaLabel) return ariaLabel.trim();

            const labelledBy = element.getAttribute("aria-labelledby");
            if (labelledBy) {
                const text = labelledBy.split(/\s+/)
                    .map(id => document.getElementById(id)?.innerText || "")
                    .join(" ")
                    .replace(/\s+/g, " ")
                    .trim();
                if (text) return text;
            }

            const row = element.closest(".input-row, fieldset, [role='group']");
            return row?.querySelector("label, legend")?.innerText?.trim() || "";
        }).catch(() => "");

        const radios = group.getByRole("radio");
        const optionCount = await radios.count().catch(() => 0);
        const options = [];
        let selectedOption = "";
        for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
            const radio = radios.nth(optionIndex);
            const optionText = (await radio.innerText().catch(() => "")).trim();
            options.push(optionText);
            if (await radio.getAttribute("aria-checked") === "true") selectedOption = optionText;
        }

        if (selectedOption) {
            console.log(`KEEP EXISTING CUSTOM RADIO: ${question} -> ${selectedOption}`);
            continue;
        }

        const profileValue = getProfileValue({
            type: "radio",
            question,
            label: question,
            options,
        }, siteAdapter);
        if (!profileValue || profileValue.value === undefined || profileValue.value === null) {
            console.log(`SKIP CUSTOM RADIO: ${question}`);
            continue;
        }

        const answer = getBooleanFormAnswer(profileValue.value, options);
        const normalizedAnswer = normalizeText(answer);
        let matchingRadio = null;
        for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
            const radio = radios.nth(optionIndex);
            const optionText = await radio.innerText().catch(() => "");
            if (normalizeText(optionText) === normalizedAnswer) {
                matchingRadio = radio;
                break;
            }
        }

        if (!matchingRadio) {
            console.log(`CUSTOM RADIO OPTION NOT FOUND: ${question} -> ${answer}`);
            continue;
        }

        if (await matchingRadio.getAttribute("aria-checked") !== "true") {
            await matchingRadio.click({ force: true });
        }
        console.log(`SELECTED CUSTOM RADIO: ${question} -> ${answer}`);
    }
};


const fillProviderCustomSelects = async (
    applicationScope,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {
    if (!siteAdapter.customSelects) return 0;

    const comboboxes = applicationScope.getByRole("combobox");
    const count = await comboboxes.count().catch(() => 0);
    let selectedCount = 0;

    for (let index = 0; index < count; index += 1) {
        const combobox = comboboxes.nth(index);
        if (!await combobox.isVisible().catch(() => false)) continue;

        const metadata = await combobox.evaluate(element => {
            const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
            const labelledBy = element.getAttribute("aria-labelledby");
            const labelledText = labelledBy
                ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText || "").join(" ")
                : "";
            let container = element.closest("fieldset, [role='group'], .field, [class*='field']")
                || element.parentElement;
            let label = container?.querySelector("label, legend, [class*='label']");
            for (let depth = 0; !label && container && depth < 6; depth += 1) {
                container = container.parentElement;
                label = container?.querySelector("label, legend, [class*='label']");
            }
            const currentValue = normalize(
                element.value
                || element.getAttribute("value")
                || element.innerText
                || element.textContent
            );

            return {
                question: normalize(element.getAttribute("aria-label") || labelledText || label?.innerText),
                placeholder: normalize(
                    element.getAttribute("placeholder")
                    || element.getAttribute("data-placeholder")
                    || element.innerText
                    || element.textContent
                ),
                selected: Boolean(currentValue)
                    && !/^(?:select|choose)\b/i.test(currentValue)
                    && !/\b(?:select|choose)(?:\.{3}|…)?$/i.test(currentValue),
            };
        }).catch(() => ({ question: "", placeholder: "", selected: false }));

        if (metadata.selected) {
            console.log(`KEEP EXISTING ${siteAdapter.type.toUpperCase()} SELECT: ${metadata.question || metadata.placeholder}`);
            continue;
        }

        await combobox.scrollIntoViewIfNeeded().catch(() => {});
        if (!await combobox.click({ force: true }).then(() => true).catch(() => false)) continue;
        await applicationScope.waitForTimeout(150);

        const optionLocators = applicationScope.locator([
            '[role="option"]',
            '[role="listbox"] li',
            '[role="listbox"] button',
        ].join(", "));
        const optionCount = await optionLocators.count().catch(() => 0);
        const visibleOptions = [];
        for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
            const option = optionLocators.nth(optionIndex);
            if (!await option.isVisible().catch(() => false)) continue;
            const text = (await option.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
            if (text) visibleOptions.push({ option, text });
        }

        const profileValue = getProfileValue({
            type: "select",
            question: metadata.question,
            label: metadata.question,
            placeholder: metadata.placeholder,
            ariaLabel: metadata.question,
            options: visibleOptions.map(({ text }) => text),
        }, siteAdapter);

        if (!profileValue || profileValue.value === undefined || profileValue.value === null) {
            continue;
        }

        const answer = getBooleanFormAnswer(profileValue.value, visibleOptions.map(({ text }) => text));
        const expected = normalizeText(answer);
        const match = visibleOptions.find(({ text }) => normalizeText(text) === expected);
        if (!match) {
            console.log(`${siteAdapter.type.toUpperCase()} CUSTOM OPTION NOT FOUND: ${metadata.question} -> ${answer}`);
            continue;
        }

        await match.option.click({ force: true });
        selectedCount += 1;
        console.log(`SELECTED ${siteAdapter.type.toUpperCase()} CUSTOM OPTION: ${metadata.question} -> ${match.text}`);
    }

    return selectedCount;
};


const acceptAgreementCheckboxes = async (
    targetPage,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {
    let acceptedCount = 0;

    for (const frame of targetPage.frames()) {
        // Oracle Candidate Experience renders its legal disclaimer as a
        // clickable span, without an input or checkbox role.
        const customCheckboxes = siteAdapter.oracleAgreementCheckbox ? frame.locator([
            ".apply-flow-input-checkbox__button",
            "[class*='checkbox__button']",
            "[data-bind*='toggleAccepted']",
        ].join(", ")) : frame.locator("__jobpilot_no_oracle_agreement__");
        const customCount = await customCheckboxes.count().catch(() => 0);

        for (let index = 0; index < customCount; index += 1) {
            const checkbox = customCheckboxes.nth(index);
            const state = await checkbox.evaluate(element => {
                const container = element.closest(
                    ".apply-flow-input-checkbox, label, fieldset, [role='group']"
                ) || element.parentElement;
                const text = (container?.innerText || "")
                    .replace(/\s+/g, " ")
                    .trim();
                const checked = element.getAttribute("aria-checked") === "true"
                    || /(?:^|\s)[^\s]*checkbox[^\s]*--checked(?:\s|$)/.test(element.className || "");

                return {
                    agreement: /^i agree\b/i.test(text)
                        || /\bi agree (?:with|to)\b/i.test(text),
                    checked,
                };
            }).catch(() => ({ agreement: false, checked: false }));

            if (!state.agreement
                || state.checked
                || !await checkbox.isVisible().catch(() => false)) {
                continue;
            }

            const clicked = await checkbox.click({ force: true })
                .then(() => true)
                .catch(() => false);
            if (clicked) {
                acceptedCount += 1;
                console.log("Accepted a custom application agreement checkbox.");
            }
        }

        const checkboxes = frame.getByRole("checkbox");
        const count = await checkboxes.count().catch(() => 0);

        for (let index = 0; index < count; index += 1) {
            const checkbox = checkboxes.nth(index);
            const agreement = await checkbox.evaluate(element => {
                const labelText = Array.from(element.labels || [])
                    .map(label => label.innerText || label.textContent || "")
                    .join(" ");
                const nearbyText = element.closest("label, fieldset, [role='group'], div")
                    ?.innerText || "";
                const text = [
                    labelText,
                    element.getAttribute("aria-label") || "",
                    nearbyText,
                ].join(" ").replace(/\s+/g, " ").trim();

                return /^i agree\b/i.test(text)
                    || /\bi agree (?:with|to)\b/i.test(text);
            }).catch(() => false);

            if (!agreement
                || !await checkbox.isVisible().catch(() => false)
                || await checkbox.isChecked().catch(() => false)) {
                continue;
            }

            await checkbox.check({ force: true }).catch(() => {});
            if (await checkbox.isChecked().catch(() => false)) {
                acceptedCount += 1;
                console.log("Accepted an application agreement checkbox.");
            }
        }
    }

    return acceptedCount;
};


const acknowledgePrivacyDialogs = async (
    targetPage,
    siteAdapter = { type: SITE_TYPES.GENERIC }
) => {
    if (!siteAdapter.acknowledgePrivacy) return false;

    for (const frame of targetPage.frames()) {
        const acknowledgeButtons = frame.getByRole("button", {
            name: /^(?:i\s+)?acknowledge$/i,
        });
        const count = await acknowledgeButtons.count().catch(() => 0);

        for (let index = 0; index < count; index += 1) {
            const button = acknowledgeButtons.nth(index);
            if (!await button.isVisible().catch(() => false)
                || !await button.isEnabled().catch(() => false)) {
                continue;
            }

            const clicked = await button.click({ force: true })
                .then(() => true)
                .catch(() => false);
            if (clicked) {
                console.log("Acknowledged the Netflix candidate privacy dialog.");
                await targetPage.waitForTimeout(300);
                return true;
            }
        }
    }

    return false;
};


const clickNextApplicationStep = async targetPage => {
    const nextActionName = /^(?:next|continue|save and continue)$/i;

    for (const frame of targetPage.frames()) {
        const candidates = [
            frame.getByRole("button", { name: nextActionName }),
            frame.getByRole("link", { name: nextActionName }),
        ];

        for (const candidateGroup of candidates) {
            const count = await candidateGroup.count().catch(() => 0);
            for (let index = 0; index < count; index += 1) {
                const candidate = candidateGroup.nth(index);
                if (!await candidate.isVisible().catch(() => false)
                    || !await candidate.isEnabled().catch(() => false)) {
                    continue;
                }

                const label = (await candidate.innerText().catch(() => "Next")).trim() || "Next";
                const clicked = await candidate.click({ timeout: 10000 })
                    .then(() => true)
                    .catch(error => {
                        console.log(`Could not click ${label}:`, error.message);
                        return false;
                    });
                if (!clicked) continue;
                console.log(`Advanced application via "${label}".`);
                return true;
            }
        }
    }

    console.log("No enabled Next or Continue action is available yet.");
    return false;
};


// ==================================================
// MULTI-PAGE APPLICATION MONITOR
// ==================================================

const startMultiPageMonitor = async (
    page,
    initialScope,
    siteAdapter,
    onSubmissionConfirmed = null
) => {

    let submitClicked = false;
    let stepAdvanceRequested = false;


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
                } else if (
                    label === "next" ||
                    label === "continue" ||
                    label.includes("save and continue")
                ) {
                    window.__jobPilotNotifyStepAdvance();
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

    await page.exposeFunction(
        "__jobPilotNotifyStepAdvance",
        () => {
            stepAdvanceRequested = true;
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


    // Step monitoring is intentionally based on navigation, not form shape.
    // Select widgets frequently add/remove hidden inputs on the same page.
    lastFormSignature = await getApplicationPageIdentity(page, siteAdapter);


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
                                    "application was successfully submitted",
                                    "your application was successfully submitted",
                                    "application submitted",
                                    "application has been submitted",
                                    "thank you for applying",
                                    "thanks for applying",
                                    "thank you for your interest",
                                    "your application has been received",
                                    "we have received your application"
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
                        submitClicked
                            ? "Application submission confirmed after Submit. Closing the browser."
                            : "Application success page detected. Closing the browser."
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
                    await closeApplicationSession();
                    return;
                }

                // Most providers use the URL as page identity. Oracle keeps
                // the same URL while moving from verification/account setup
                // into the real application, so its adapter contributes a
                // stable phase marker. Ordinary field mutations are ignored.
                const explicitAdvance = stepAdvanceRequested;
                stepAdvanceRequested = false;
                if (explicitAdvance) {
                    await page.waitForTimeout(900);
                }

                const currentPageIdentity = await getApplicationPageIdentity(page, siteAdapter);
                if (currentPageIdentity === lastFormSignature) return;
                lastFormSignature = currentPageIdentity;

                const applicationScope =
                    await findApplicationScope(
                        page,
                        0,
                        false
                    );

                console.log(
                    "\n========== NEW APPLICATION STEP DETECTED =========="
                );


                await uploadResume(
                    applicationScope
                );


                const fields =
                    await extractApplicationFields(
                        applicationScope,
                        siteAdapter
                    );


                await fillApplicationFields(
                    applicationScope,
                    fields,
                    siteAdapter
                );

                await fillCustomRadioGroups(applicationScope, siteAdapter);
                await fillProviderCustomSelects(applicationScope, siteAdapter);
                await acceptAgreementCheckboxes(page, siteAdapter);
                await clickNextApplicationStep(page);

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
        "Step monitoring is active. JobPilot will refill and advance multi-page applications."
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
    resumeUploaded = false;
    externalProfileImported = false;


    if (!targetContext) {
        page = null;
        await clearSelectedResume();
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

    await clearSelectedResume();
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
    await prepareSelectedResume(options.resume);


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

    page = await openApplicationForm(page, launchedContext);

    let siteAdapter = await detectApplicationSite(page);
    console.log(`Application site adapter: ${siteAdapter.type}`);

    await acknowledgePrivacyDialogs(page, siteAdapter);

    const greenhouseAutofill = page.getByRole("button", {
        name: /autofill my application/i
    });
    if (siteAdapter.greenhouseProfileImport
        && await greenhouseAutofill.first().isVisible().catch(() => false)) {
        console.log("Greenhouse autofill is available; opening it first.");
        await greenhouseAutofill.first().click({ force: true });
        await page.waitForTimeout(1500);
        externalProfileImported = true;
    }


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


    const resolvedSiteAdapter = await detectApplicationSite(page);
    if (resolvedSiteAdapter.type !== siteAdapter.type) {
        console.log(`Application site adapter changed after navigation: ${siteAdapter.type} -> ${resolvedSiteAdapter.type}`);
        siteAdapter = resolvedSiteAdapter;
    }

    await acknowledgePrivacyDialogs(page, siteAdapter);


    const applicationScope =
        await findApplicationScope(
            page
        );


    // ==================================================
    // 6. EXPAND ACCORDIONS
    // ==================================================

    // await expandAllAccordions(
    //     applicationScope
    // );


    // ==================================================
    // 7. WAIT FOR DYNAMIC FIELDS
    // ==================================================

    await page.waitForTimeout(
        2000
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
            applicationScope,
            siteAdapter
        );

    const normalizedApplication = {
        job: {
            url: jobUrl,
            title: await page.title()
        },
        fields: finalFields
    };


    console.log(
        "\n========== FINAL FIELD COUNT =========="
    );


    console.log(
        finalFields.length
    );


    // ==================================================
    // 15. AUTOFILL
    // ==================================================

    await fillApplicationFields(
        applicationScope,
        finalFields,
        siteAdapter
    );


    // Watch multi-page navigation and fill conditional fields
    // that appear after answers are selected.
    await startMultiPageMonitor(
        page,
        applicationScope,
        siteAdapter,
        options.onSubmissionConfirmed
    );


    await fillCustomRadioGroups(applicationScope, siteAdapter);
    await fillProviderCustomSelects(applicationScope, siteAdapter);
    await acceptAgreementCheckboxes(page, siteAdapter);
    await clickNextApplicationStep(page);


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
