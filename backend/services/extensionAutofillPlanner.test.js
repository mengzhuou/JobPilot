const assert = require("node:assert/strict");
const { createDeterministicFillPlan } = require("./extensionAutofillPlanner");

const profile = {
    candidate: {
        name: "Avery Ng",
        first_name: "Avery",
        last_name: "Ng",
        email: "avery@example.com",
        phone: "555-0100",
        location: {
            address_line_1: "1 Main Street",
            city: "Austin",
            state: "Texas",
            country: "United States",
            postal_code: "78701",
        },
        links: { linkedin: "https://linkedin.com/in/avery" },
    },
    education: { school: "Example University", highest_level: "Bachelor of Science", field_of_study: "Computer Science", undergraduate_gpa: "3.8" },
    career: { current_company: "Example Co", current_title: "Software Engineer" },
    experience: { total_professional_software_engineering_years: 3.2 },
    skills: ["React", "TypeScript"],
    job_preferences: { earliest_start_date: "2026-01-05", applying_for_full_time: true },
    work_authorization: { authorized_to_work_without_sponsorship: true, requires_employment_sponsorship: false, has_saved_authorization_answer: true, has_saved_sponsorship_answer: true, authorized_to_work_form_options: ["Yes"] },
    eeoc: {
        hispanic_latino: { answer: "No", form_options: ["Not Hispanic or Latino"] },
        veteran_status: { answer: "Not a protected veteran", form_options: ["I am not a protected veteran"] },
    },
    application_answers: {},
    Q_and_A: {},
};

const fields = [
    { fieldKey: "first", label: "First Name", type: "text", currentValue: "Avery", filled: true },
    { fieldKey: "city", label: "Location (City)", type: "text" },
    { fieldKey: "sponsor", label: "Will you now or in the future require immigration sponsorship?", type: "select", options: ["Select…", "Yes", "No"] },
    { fieldKey: "sponsor-custom", label: "Will you require sponsorship?", type: "combobox", options: [] },
    { fieldKey: "hispanic", label: "Are you Hispanic/Latino?", type: "radio", options: ["Yes", "No", "Decline to self-identify"] },
    { fieldKey: "veteran", label: "Veteran Status", type: "select", options: ["Select…", "I am not a protected veteran", "I identify as a protected veteran"] },
    { fieldKey: "privacy", label: "Acknowledge/Confirm privacy policy", type: "checkbox" },
    { fieldKey: "salary", label: "Desired salary", type: "text" },
    { fieldKey: "signature", label: "Electronic signature", type: "text" },
    { fieldKey: "resume", label: "Attach", name: "Resume/CV", type: "file" },
];

const plan = createDeterministicFillPlan({ fields, profile });
const byKey = Object.fromEntries(plan.answers.map(answer => [answer.fieldKey, answer]));

assert.equal(byKey.first.action, "skip");
assert.equal(byKey.city.value, "Austin");
assert.equal(byKey.sponsor.value, "No");
assert.equal(byKey["sponsor-custom"].value, "No");
assert.equal(byKey.hispanic.value, "No");
assert.equal(byKey.veteran.value, "I am not a protected veteran");
assert.equal(byKey.privacy.action, "fill");
assert.equal(byKey.privacy.value, "true");
assert.equal(byKey.salary.action, "ask_user");
assert.equal(byKey.signature.action, "ask_user");
assert.equal(byKey.resume.action, "skip");
assert.equal(byKey.resume.resumeAttachment, true);
assert.deepEqual(plan.summary, { total: 10, ready: 6, needsReview: 2, skipped: 2 });

console.log("Extension autofill planner checks passed.");
