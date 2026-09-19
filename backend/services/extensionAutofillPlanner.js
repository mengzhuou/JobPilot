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

const safeField = field => ({
    fieldKey: clean(field?.fieldKey).slice(0, 240),
    label: clean(field?.label || field?.question).slice(0, MAX_FIELD_TEXT),
    placeholder: clean(field?.placeholder).slice(0, 240),
    autocomplete: clean(field?.autocomplete).slice(0, 100),
    name: clean(field?.name).slice(0, 200),
    type: clean(field?.type || "text").slice(0, 50),
    required: Boolean(field?.required),
    filled: Boolean(field?.filled),
    currentValue: clean(field?.currentValue).slice(0, MAX_FIELD_TEXT),
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
    if (!field.options.length) return clean(candidates.find(value => value !== undefined && value !== null));
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
    if (field.type === "file") return result(field, "ask_user", "", "resume", "Upload your selected résumé manually in the browser.");
    if (containsAny(question, ["signature", "certify", "attest", "truthful", "electronic signature"])) {
        return result(field, "ask_user", "", "legal", "A signature or legal certification requires your review.");
    }
    if (field.type === "checkbox" && containsAny(question, ["acknowledge", "confirm", "privacy policy", "privacy notice"])) {
        return fill(field, [true, "Yes", "Acknowledge/Confirm"], "acknowledgement", "Acknowledgement requested on the application.");
    }

    if (containsAny(question, ["visa sponsorship", "employment sponsorship", "immigration sponsorship", "require sponsorship", "need sponsorship", "future sponsorship"])) {
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
    if ((containsAny(question, ["full name", "legal name", "your name", "candidate name"]) || field.autocomplete === "name") && !containsAny(question, ["company name", "school name"])) return fill(field, candidate.name, "Profile · Personal", "Matched full name.");
    if (containsAny(question, ["email", "e mail"]) || field.type === "email" || field.autocomplete === "email") return fill(field, candidate.email, "Profile · Personal", "Matched email address.");
    if (containsAny(question, ["phone", "mobile", "telephone"]) || field.type === "tel" || field.autocomplete === "tel") return fill(field, candidate.phone, "Profile · Personal", "Matched phone number.");
    if (containsAny(question, ["linkedin"])) return fill(field, links.linkedin, "Profile · Links", "Matched LinkedIn profile.");
    if (containsAny(question, ["github"])) return fill(field, links.github, "Profile · Links", "Matched GitHub profile.");
    if (containsAny(question, ["portfolio", "personal website", "website url"])) return fill(field, links.portfolio, "Profile · Links", "Matched portfolio URL.");

    if (containsAny(question, ["postal code", "zip code", "zipcode"]) || field.autocomplete === "postal-code") return fill(field, location.postal_code, "Profile · Address", "Matched postal code.");
    if (containsAny(question, ["street address", "address line 1", "address 1"]) || field.autocomplete === "address-line1") return fill(field, location.address_line_1, "Profile · Address", "Matched street address.");
    if (containsAny(question, ["city", "current location", "where are you currently located"]) || field.autocomplete === "address-level2") return fill(field, [location.city, `${location.city}, ${location.state}`, answers.preferred_application_location], "Profile · Address", "Matched city or current location.");
    if (containsAny(question, ["state", "province", "region"]) || field.autocomplete === "address-level1") return fill(field, location.state, "Profile · Address", "Matched state or region.");
    if (containsAny(question, ["country"]) || field.autocomplete === "country-name") return fill(field, location.country, "Profile · Address", "Matched country.");

    if (containsAny(question, ["school", "university", "college"]) && !containsAny(question, ["graduate school"])) return fill(field, education.school, "Profile · Education", "Matched school.");
    if (containsAny(question, ["degree", "education level", "highest level of education"])) return fill(field, [education.highest_level, ...(education.highest_level_form_options || [])], "Profile · Education", "Matched degree.");
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
    if (containsAny(question, ["race", "ethnicity", "racial ethnic"])) return fill(field, [eeoc.race?.answer, ...(eeoc.race?.form_options || [])], "Profile · Equal Employment", "Matched saved race or ethnicity answer.", { sensitive: true });
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
