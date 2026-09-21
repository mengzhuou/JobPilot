const {
    findEquivalentFormOption,
    getBooleanFormAnswer,
    normalizeText,
} = require("./applicationAgentUtils");

const MAX_FIELDS = 120;
const MAX_FIELD_TEXT = 500;

const clean = value => String(value ?? "").trim();
const normalized = value => normalizeText(value);
const containsAny = (value, phrases) => phrases.some(phrase => value.includes(phrase));

// Degree dropdowns ask for a qualification level, not the major in its title.
// Keep professional degrees distinct; a master's degree does not imply an MBA.
const degreeLabel = value => {
    const text = clean(value).toLowerCase().replace(/[.’']/g, "");
    if (/^(bachelor\b|bachelors\b|bsc\b|bs\b|ba\b|beng\b)/.test(text)) return "Bachelor's Degree";
    if (/^(associate\b|associates\b|aas\b|aa\b|as\b)/.test(text)) return "Associate's Degree";
    if (/^(master of business administration\b|mba\b)/.test(text)) return "Master of Business Administration (M.B.A.)";
    if (/^(master\b|masters\b|msc\b|ms\b|ma\b|meng\b)/.test(text)) return "Master's Degree";
    if (/^(doctor of philosophy\b|phd\b)/.test(text)) return "Doctor of Philosophy (Ph.D.)";
    if (/^(doctor of medicine\b|md\b)/.test(text)) return "Doctor of Medicine (M.D.)";
    if (/^(juris doctor\b|jd\b)/.test(text)) return "Juris Doctor (J.D.)";
    if (/^high school\b/.test(text)) return "High School";
    return "";
};

const safeField = field => ({
    fieldKey: clean(field?.fieldKey).slice(0, 240),
    label: clean(field?.label || field?.question).slice(0, MAX_FIELD_TEXT),
    placeholder: clean(field?.placeholder).slice(0, 240),
    autocomplete: clean(field?.autocomplete).slice(0, 100),
    name: clean(field?.name).slice(0, 200),
    type: clean(field?.type || "text").slice(0, 50),
    required: Boolean(field?.required),
    filled: Boolean(field?.filled) && !field?.hasError,
    currentValue: clean(field?.currentValue).slice(0, MAX_FIELD_TEXT),
    hasError: Boolean(field?.hasError),
    errorMessage: clean(field?.errorMessage).slice(0, MAX_FIELD_TEXT),
    options: Array.isArray(field?.options)
        ? field.options.map(clean).filter(Boolean).slice(0, 60)
        : [],
});

const fieldQuestion = field => normalized([
    field.label,
    field.placeholder,
    field.autocomplete,
    field.name,
].filter(Boolean).join(" "));

const optionFor = (field, candidates) => {
    if (!field.options.length) {
        const candidate = candidates.find(value => value !== undefined && value !== null && clean(value));
        if (typeof candidate === "boolean") {
            return field.type === "checkbox" ? String(candidate) : (candidate ? "Yes" : "No");
        }
        return clean(candidate);
    }
    for (const candidate of candidates.filter(value => value !== undefined && value !== null && clean(value))) {
        if (typeof candidate === "boolean") {
            const answer = getBooleanFormAnswer(candidate, field.options);
            if (typeof answer === "string" && field.options.includes(answer)) return answer;
            continue;
        }
        const match = findEquivalentFormOption(field.options, candidate);
        if (match) return match;
    }
    return "";
};

const result = (field, action, value, source, reason, extra = {}) => ({
    fieldKey: field.fieldKey,
    action,
    value: value === undefined || value === null ? "" : String(value),
    source,
    reason,
    ...extra,
});

const fill = (field, candidates, source, reason, extra) => {
    if (field.type === "checkbox" && Array.isArray(candidates) && candidates[0] === false) {
        return result(field, "skip", "false", source, "This checkbox should remain unselected based on your Profile.", extra);
    }
    const value = optionFor(field, Array.isArray(candidates) ? candidates : [candidates]);
    if (!value && value !== false) {
        return result(field, "ask_user", "", source, "Your Profile has an answer, but it does not match an available option.", extra);
    }
    return result(field, "fill", value, source, reason, extra);
};

const qaAnswer = (profile, question) => Object.values(profile.Q_and_A || {}).find(entry =>
    (entry.questions || []).some(candidate => {
        const expected = normalized(candidate);
        return expected && (question.includes(expected) || expected.includes(question));
    })
)?.answer;

const planField = (field, profile) => {
    const question = fieldQuestion(field);
    const candidate = profile.candidate || {};
    const location = candidate.location || {};
    const links = candidate.links || {};
    const education = profile.education || {};
    const career = profile.career || {};
    const workAuthorization = profile.work_authorization || {};
    const eeoc = profile.eeoc || {};
    const answers = profile.application_answers || {};

    if (!field.fieldKey) return result(field, "skip", "", "system", "The field could not be identified safely.");
    if (field.filled) return result(field, "skip", field.currentValue, "existing", "Already filled; JobPilot will not overwrite it.");
    if (field.type === "hidden" || field.type === "submit" || field.type === "button") {
        return result(field, "skip", "", "system", "This is not an application answer field.");
    }
    if (field.type === "password") return result(field, "ask_user", "", "security", "Passwords are never autofilled by JobPilot.");
    if (field.type === "file") return result(field, "skip", "", "Primary résumé", "The JobPilot extension attaches your primary résumé during Autofill.", { resumeAttachment: true });
    if (containsAny(question, ["signature", "certify", "attest", "truthful", "electronic signature"])) {
        return result(field, "ask_user", "", "legal", "A signature or legal certification requires your review.");
    }
    if (field.type === "checkbox" && containsAny(question, ["acknowledge", "confirm", "privacy policy", "privacy notice"])) {
        return fill(field, [true, "Yes", "Acknowledge/Confirm"], "acknowledgement", "Acknowledgement requested on the application.");
    }

    if (/\b(active|pending|ongoing|open)\s+(?:immigration|visa)\s+(?:case|application|petition)\b/.test(question)) {
        if (!workAuthorization.has_saved_active_immigration_case_answer) return result(field, "ask_user", "", "Profile · Work authorization", "Save your active immigration case answer in Profile before autofilling it.", { sensitive: true });
        const activeCase = Boolean(workAuthorization.active_immigration_case);
        return fill(field, [activeCase, activeCase ? "Yes" : "No", String(activeCase)], "Profile · Work authorization", "Matched your saved active immigration case answer.", { sensitive: true });
    }
    if (/\binterview\w*\b/.test(question) && /\b(?:programming|coding)\b/.test(question) && /\blanguage\b/.test(question) && /\b(?:prefer\w*|choose|choice|use)\b/.test(question)) {
        if (!clean(profile.job_preferences?.preferred_interview_language)) return result(field, "ask_user", "", "Profile · Job preferences", "Save your preferred interview programming language in Profile before autofilling it.");
        return fill(field, profile.job_preferences?.preferred_interview_language, "Profile · Job preferences", "Matched your saved interview programming language.");
    }
    if (containsAny(question, ["visa sponsorship", "employment sponsorship", "immigration sponsorship", "require sponsorship", "need sponsorship", "future sponsorship", "sponsor an immigration case"])) {
        if (!workAuthorization.has_saved_sponsorship_answer) {
            return result(field, "ask_user", "", "Profile · Work authorization", "Save your sponsorship answer in Profile before autofilling it.", { sensitive: true });
        }
        const needsSponsorship = Boolean(workAuthorization.requires_employment_sponsorship);
        return fill(field, [needsSponsorship, needsSponsorship ? "Yes" : "No"], "Profile · Work authorization", "Matched to your saved sponsorship answer.", { sensitive: true });
    }
    if (containsAny(question, ["authorized to work", "authorised to work", "legally eligible to work", "work authorization", "work authorisation"])) {
        if (!workAuthorization.has_saved_authorization_answer) {
            return result(field, "ask_user", "", "Profile · Work authorization", "Save your work authorization answer in Profile before autofilling it.", { sensitive: true });
        }
        const authorized = Boolean(workAuthorization.authorized_to_work_without_sponsorship);
        return fill(field, [authorized, authorized ? "Yes" : "No", ...(workAuthorization.authorized_to_work_form_options || [])], "Profile · Work authorization", "Matched to your saved work authorization.", { sensitive: true });
    }

    if (containsAny(question, ["first name", "given name"]) || field.autocomplete === "given-name") return fill(field, candidate.first_name, "Profile · Personal", "Matched first name.");
    if (containsAny(question, ["last name", "family name", "surname"]) || field.autocomplete === "family-name") return fill(field, candidate.last_name, "Profile · Personal", "Matched last name.");
    if ((containsAny(question, ["full name", "legal name", "your name", "candidate name"]) || normalized(field.label) === "name" || field.autocomplete === "name") && !containsAny(question, ["company name", "school name"])) return fill(field, candidate.name, "Profile · Personal", "Matched full name.");
    if (containsAny(question, ["email", "e mail"]) || field.type === "email" || field.autocomplete === "email") return fill(field, candidate.email, "Profile · Personal", "Matched email address.");
    if (containsAny(question, ["phone", "mobile", "telephone"]) || field.type === "tel" || field.autocomplete === "tel") return fill(field, candidate.phone, "Profile · Personal", "Matched phone number.");
    if (containsAny(question, ["linkedin"])) return fill(field, links.linkedin, "Profile · Links", "Matched LinkedIn profile.");
    if (containsAny(question, ["github"])) return fill(field, links.github, "Profile · Links", "Matched GitHub profile.");
    if (containsAny(question, ["portfolio", "personal website", "website url"])) return fill(field, links.portfolio, "Profile · Links", "Matched portfolio URL.");

    if (containsAny(question, ["postal code", "zip code", "zipcode"]) || field.autocomplete === "postal-code") return fill(field, location.postal_code, "Profile · Address", "Matched postal code.");
    if (containsAny(question, ["street address", "address line 1", "address 1"]) || field.autocomplete === "address-line1") return fill(field, location.address_line_1, "Profile · Address", "Matched street address.");
    if (containsAny(question, ["city", "current location", "where are you currently located"]) || normalized(field.label) === "location" || field.autocomplete === "address-level2") return fill(field, [location.city, `${location.city}, ${location.state}`, answers.preferred_application_location], "Profile · Address", "Matched city or current location.", {
        optionContext: { city: clean(location.city), state: clean(location.state), country: clean(location.country) },
    });
    if (containsAny(question, ["state", "province", "region"]) || field.autocomplete === "address-level1") return fill(field, location.state, "Profile · Address", "Matched state or region.");
    if (containsAny(question, ["country"]) || field.autocomplete === "country-name") return fill(field, location.country, "Profile · Address", "Matched country.");

    if (/^education (start|end) date (month|year)$/.test(normalized(field.label))) {
        const parts = normalized(field.label).split(" ");
        const date = /^(\d{4})(?:-(\d{2}))?/.exec(clean(parts[1] === "start" ? education.start_date : education.end_date));
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const value = parts[3] === "year" ? date?.[1] : months[Number(date?.[2]) - 1];
        return fill(field, [value], "Profile · Education", "Matched saved education date.");
    }
    if (containsAny(question, ["school", "university", "college"]) && !containsAny(question, ["graduate school"])) return fill(field, education.school, "Profile · Education", "Matched school.");
    if (containsAny(question, ["degree", "education level", "highest level of education"])) {
        const label = degreeLabel(education.highest_level);
        if (label && field.options.length) {
            const choices = [education.highest_level, label, ...(education.highest_level_form_options || [])].map(normalized);
            const exact = field.options.find(option => choices.includes(normalized(option)));
            return exact ? fill(field, [exact], "Profile · Education", "Matched degree.")
                : result(field, "ask_user", "", "Profile · Education", "No equivalent degree option was found. Please select your qualification.");
        }
        return fill(field, [education.highest_level, label, ...(education.highest_level_form_options || [])], "Profile · Education", "Matched degree.", {
            optionContext: { degreeLabel: label },
        });
    }
    if (containsAny(question, ["major", "field of study"])) return fill(field, education.field_of_study, "Profile · Education", "Matched field of study.");
    if (containsAny(question, ["gpa", "grade point average"])) return fill(field, education.undergraduate_gpa, "Profile · Education", "Matched GPA.");

    if (containsAny(question, ["current company", "current employer"])) return fill(field, career.current_company, "Profile · Work experience", "Matched current company.");
    if (containsAny(question, ["current title", "job title", "current role"])) return fill(field, career.current_title, "Profile · Work experience", "Matched current title.");
    if (containsAny(question, ["years of experience", "years professional experience", "how many years"])) return fill(field, profile.experience?.total_professional_software_engineering_years, "Profile · Work experience", "Calculated from non-overlapping Profile work dates.");
    if (containsAny(question, ["skills", "technical expertise", "technologies"]) && ["text", "textarea"].includes(field.type)) return fill(field, (profile.skills || []).join(", "), "Profile · Skills", "Matched saved skills.");

    if (containsAny(question, ["earliest start", "when can you start", "available start date"])) return fill(field, profile.job_preferences?.earliest_start_date, "Profile · Preferences", "Matched earliest start date.");
    if (containsAny(question, ["full time", "fulltime"]) && ["radio", "select", "checkbox"].includes(field.type)) return fill(field, [profile.job_preferences?.applying_for_full_time, "Full-time"], "Profile · Preferences", "Matched employment preference.");
    if (containsAny(question, ["how did you hear", "how heard", "source of application"])) return fill(field, answers.how_heard_about_company, "Saved application answer", "Matched saved source answer.");
    if (containsAny(question, ["security clearance", "active clearance"])) return fill(field, answers.active_security_clearance, "Saved application answer", "Matched saved clearance answer.", { sensitive: true });

    if (containsAny(question, ["veteran status", "protected veteran", "veteran classification"])) return fill(field, [eeoc.veteran_status?.answer, ...(eeoc.veteran_status?.form_options || [])], "Profile · Equal Employment", "Matched saved veteran status.", { sensitive: true });
    if (containsAny(question, ["disability status", "have a disability", "disability self identification"])) return fill(field, [eeoc.disability_status?.answer, ...(eeoc.disability_status?.form_options || [])], "Profile · Equal Employment", "Matched saved disability answer.", { sensitive: true });
    if (containsAny(question, ["gender", "gender identity"])) return fill(field, [eeoc.gender?.answer, ...(eeoc.gender?.form_options || [])], "Profile · Equal Employment", "Matched saved gender answer.", { sensitive: true });
    if (containsAny(question, ["hispanic", "latino", "latina", "latinx"])) return fill(field, [eeoc.hispanic_latino?.answer, ...(eeoc.hispanic_latino?.form_options || [])], "Profile · Equal Employment", "Matched saved Hispanic or Latino answer.", { sensitive: true });
    if (containsAny(question, ["ethnicity", "racial ethnic"])) return fill(field, [eeoc.hispanic_latino?.answer, ...(eeoc.hispanic_latino?.form_options || []), eeoc.race?.answer, ...(eeoc.race?.form_options || [])], "Profile · Equal Employment", "Matched saved ethnicity answer.", { sensitive: true });
    if (containsAny(question, ["race", "racial identity"])) return fill(field, [eeoc.race?.answer, ...(eeoc.race?.form_options || [])], "Profile · Equal Employment", "Matched saved race answer.", { sensitive: true });
    if (containsAny(question, ["sexual orientation"])) return fill(field, [eeoc.sexual_orientation?.answer, ...(eeoc.sexual_orientation?.form_options || [])], "Profile · Equal Employment", "Matched saved sexual orientation answer.", { sensitive: true });
    if (containsAny(question, ["transgender"])) return fill(field, [eeoc.transgender_status?.answer, ...(eeoc.transgender_status?.form_options || [])], "Profile · Equal Employment", "Matched saved transgender answer.", { sensitive: true });

    const savedQa = qaAnswer(profile, question);
    if (savedQa) return fill(field, savedQa, "Saved application answer", "Matched a saved application question.");

    if (containsAny(question, ["salary", "compensation", "pay expectation"])) {
        return result(field, "ask_user", "", "user", "Compensation expectations are not saved in your Profile.");
    }
    return result(field, "ask_user", "", "user", "No reliable Profile answer was found.");
};

const createDeterministicFillPlan = ({ fields, profile }) => {
    const safeFields = (Array.isArray(fields) ? fields : []).slice(0, MAX_FIELDS).map(safeField);
    const answers = safeFields.map(field => planField(field, profile));
    return {
        answers,
        summary: {
            total: answers.length,
            ready: answers.filter(answer => answer.action === "fill").length,
            needsReview: answers.filter(answer => answer.action === "ask_user").length,
            skipped: answers.filter(answer => answer.action === "skip").length,
        },
    };
};

module.exports = { createDeterministicFillPlan, safeField, planField };
