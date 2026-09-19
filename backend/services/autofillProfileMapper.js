const fallbackProfile = require("./profile.json");

const text = value => String(value ?? "").trim();
const key = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rows = value => Array.isArray(value) ? value : [];
const labelMap = value => Object.fromEntries(rows(value)
    .filter(row => Array.isArray(row) && row.length === 2)
    .map(([label, answer]) => [key(label), answer]));
const firstValue = (...candidates) => candidates.find(value => text(value)) || "";
const flattenSkills = value => Array.isArray(value) ? value : Object.values(value || {}).flatMap(item => Array.isArray(item) ? item : []);
const profileLink = (links, label) => rows(links)
    .find(link => key(link?.label) === label)?.href || "";

const monthDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

// Avoid inflating experience by counting overlapping roles twice.
const totalExperienceYears = experience => {
    const ranges = rows(experience).map(item => {
        const start = monthDate(item?.from);
        const end = item?.current || /present|current/i.test(text(item?.to)) ? new Date() : monthDate(item?.to);
        return start && end && end >= start ? [start.getTime(), end.getTime()] : null;
    }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    const merged = ranges.reduce((all, range) => {
        const last = all.at(-1);
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else all.push([...range]);
        return all;
    }, []);
    const milliseconds = merged.reduce((total, [start, end]) => total + end - start, 0);
    return Math.round((milliseconds / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
};

const optionValues = (answer, fallbackOptions = []) => [...new Set([answer, ...fallbackOptions].filter(Boolean))];
const booleanAnswer = value => /^yes$/i.test(text(value));
const choice = (answers, label) => answers[key(label)];

const validateEditableProfile = profile => {
    const personal = profile?.personal || {};
    const education = rows(profile?.education)[0] || {};
    const missing = [
        ["first name", personal.firstName], ["last name", personal.lastName], ["email", personal.email],
        ["phone", personal.phone], ["address line", personal.addressLine], ["city", personal.city],
        ["state", personal.state], ["country", personal.country], ["education school", education.school],
        ["education degree", education.degree],
    ].filter(([, value]) => !text(value)).map(([label]) => label);
    if (text(personal.email) && !/^\S+@\S+\.\S+$/.test(text(personal.email))) missing.push("a valid email");
    return missing;
};

/**
 * Translates the editable account Profile into the field names consumed by the
 * Playwright agent. The account Profile wins for every field it exposes.
 * profile.json only supplies site-specific option phrases and answers that do
 * not have an editable Profile field yet.
 */
const mapProfileForAutofill = (editableProfile, fallback = fallbackProfile) => {
    const personal = editableProfile?.personal || {};
    const educationList = rows(editableProfile?.education);
    const education = educationList[0] || {};
    const experience = rows(editableProfile?.experience);
    const preferences = labelMap(editableProfile?.preferences);
    const equalEmployment = labelMap(editableProfile?.equalEmployment);
    const firstName = text(personal.firstName);
    const lastName = text(personal.lastName);
    const preferredLocation = choice(preferences, "preferred application location");
    const authorized = booleanAnswer(choice(equalEmployment, "authorized to work in the united states"));
    const needsSponsorship = booleanAnswer(choice(equalEmployment, "requires employment sponsorship"));
    const citizenship = choice(equalEmployment, "citizenship status");
    const currentRole = experience.find(item => item?.current || /present|current/i.test(text(item?.to))) || experience[0] || {};
    const mapped = {
        candidate: {
            name: firstValue([firstName, personal.middleName, lastName].filter(Boolean).join(" "), personal.name),
            first_name: firstName,
            last_name: lastName,
            email: text(personal.email),
            phone: text(personal.phone),
            location: {
                address_line_1: text(personal.addressLine), city: text(personal.city), state: text(personal.state),
                country: text(personal.country), postal_code: text(personal.postalCode),
            },
            links: {
                linkedin: profileLink(personal.links, "linkedin"), github: profileLink(personal.links, "github"),
                portfolio: profileLink(personal.links, "portfolio"),
            },
        },
        education: {
            school: text(education.school), highest_level: text(education.degree), field_of_study: text(education.degree),
            undergraduate_gpa: text(education.gpa),
            // Keep recruiting-site degree choices as compatibility aliases, not as the source of facts.
            highest_level_form_options: optionValues(education.degree, fallback.education?.highest_level_form_options),
            currently_pursuing_further_education: Boolean(education.current || /present|current/i.test(text(education.to))),
            graduate_gpa: fallback.education?.graduate_gpa,
            doctorate_gpa: fallback.education?.doctorate_gpa,
            sat_score: fallback.education?.sat_score,
            act_score: fallback.education?.act_score,
            gre_score: fallback.education?.gre_score,
        },
        career: {
            current_company: text(currentRole.company), current_title: text(currentRole.title),
            work_history: experience.map(item => ({
                job_title: text(item.title), company: text(item.company), from: text(item.from), to: text(item.to) || null,
                current: Boolean(item.current || /present|current/i.test(text(item.to))),
            })),
        },
        experience: { total_professional_software_engineering_years: totalExperienceYears(experience) },
        skills: flattenSkills(editableProfile?.skills).map(text).filter(Boolean),
        job_preferences: {
            applying_for_internship_or_coop: /internship|coop/i.test(text(choice(preferences, "seeking"))),
            applying_for_full_time: /full[ -]?time/i.test(text(choice(preferences, "seeking"))),
            earliest_start_date: text(choice(preferences, "earliest start date")),
            office_days_per_week_form_option: text(choice(preferences, "office preference")),
        },
        work_authorization: {
            us_citizen_or_permanent_resident: /citizen|permanent resident/i.test(text(citizenship)),
            authorized_to_work_without_sponsorship: authorized && !needsSponsorship,
            requires_employment_sponsorship: needsSponsorship,
            has_saved_authorization_answer: Boolean(text(choice(equalEmployment, "authorized to work in the united states"))),
            has_saved_sponsorship_answer: Boolean(text(choice(equalEmployment, "requires employment sponsorship"))),
            authorized_to_work_form_options: optionValues(authorized ? "Yes" : "No", fallback.work_authorization?.authorized_to_work_form_options),
            citizenship_status_form_options: optionValues(citizenship, fallback.work_authorization?.citizenship_status_form_options),
        },
        eeoc: {
            gender: { answer: choice(equalEmployment, "gender"), form_options: optionValues(choice(equalEmployment, "gender"), fallback.eeoc?.gender?.form_options) },
            race: { answer: choice(equalEmployment, "race"), form_options: optionValues(choice(equalEmployment, "race"), fallback.eeoc?.race?.form_options) },
            veteran_status: { answer: choice(equalEmployment, "veteran status"), form_options: optionValues(choice(equalEmployment, "veteran status"), fallback.eeoc?.veteran_status?.form_options) },
            sexual_orientation: { answer: choice(equalEmployment, "sexual orientation"), form_options: optionValues(choice(equalEmployment, "sexual orientation"), fallback.eeoc?.sexual_orientation?.form_options) },
            transgender_status: { answer: choice(equalEmployment, "transgender experience"), is_transgender: booleanAnswer(choice(equalEmployment, "transgender experience")), form_options: optionValues(choice(equalEmployment, "transgender experience"), fallback.eeoc?.transgender_status?.form_options) },
            disability_status: { answer: choice(equalEmployment, "disability"), has_disability: booleanAnswer(choice(equalEmployment, "disability")), form_options: optionValues(choice(equalEmployment, "disability"), fallback.eeoc?.disability_status?.form_options) },
        },
        // These are not editable in Profile yet, so retaining the curated
        // answers is intentional until dedicated Profile fields exist.
        application_answers: fallback.application_answers || {},
        autofill_policy: fallback.autofill_policy || {},
        Q_and_A: fallback.Q_and_A || {},
    };
    mapped.application_answers = {
        ...mapped.application_answers,
        preferred_application_location: preferredLocation || fallback.application_answers?.preferred_application_location || "",
    };
    return { profile: mapped, missing: validateEditableProfile(editableProfile) };
};

module.exports = { mapProfileForAutofill, validateEditableProfile, totalExperienceYears };
