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
    { fieldKey: "sponsor", label: "Will you now or in the future require immigration sponsorship?", type: "select", options: ["Select…", "Yes", "No"], filled: true, currentValue: "No", hasError: true, errorMessage: "This field is required." },
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
assert.deepEqual(byKey.city.optionContext, { city: "Austin", state: "Texas", country: "United States" });
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

const demographicFields = [
    { fieldKey: "gender", label: "Gender", type: "radio", options: ["Male", "Female", "Decline to self-identify"] },
    { fieldKey: "race", label: "Race", type: "radio", options: ["Hispanic or Latino", "Asian (Not Hispanic or Latino)", "Decline to self-identify"] },
];
const savedDemographics = createDeterministicFillPlan({ fields: demographicFields, profile: { ...profile, eeoc: {
    gender: { answer: "Female" }, race: { answer: "Asian (Not Hispanic or Latino)" },
} } });
assert.deepEqual(savedDemographics.answers.map(answer => answer.value), ["Female", "Asian (Not Hispanic or Latino)"]);
assert.ok(savedDemographics.answers.every(answer => answer.action === "fill" && answer.sensitive));
const unsavedDemographics = createDeterministicFillPlan({ fields: demographicFields, profile: { ...profile, eeoc: {} } });
assert.ok(unsavedDemographics.answers.every(answer => answer.action === "ask_user" && !answer.value), "Never infer demographic answers from other profile information");

for (const [title, label] of [["Bachelor of Science in Computer Science", "Bachelor's Degree"], ["B.S.", "Bachelor's Degree"], ["Master of Science", "Master's Degree"], ["MBA", "Master of Business Administration (M.B.A.)"]]) {
    const degreeProfile = { ...profile, education: { highest_level: title } };
    const degreeField = { fieldKey: "degree", label: "Degree", type: "combobox", hasError: true, filled: true };
    const custom = createDeterministicFillPlan({ fields: [degreeField], profile: degreeProfile }).answers[0];
    assert.equal(custom.action, "fill");
    assert.equal(custom.optionContext.degreeLabel, label);
    const native = createDeterministicFillPlan({ fields: [{ ...degreeField, options: ["Associate's Degree", label] }], profile: degreeProfile }).answers[0];
    assert.equal(native.value, label);
}
const mismatchedDegree = createDeterministicFillPlan({ fields: [{ fieldKey: "degree", label: "Degree", type: "select", options: ["Bachelor of Arts", "Master's Degree"] }], profile }).answers[0];
assert.equal(mismatchedDegree.action, "ask_user");
console.log("Extension autofill planner checks passed.");
const educationPlan = createDeterministicFillPlan({ profile: { ...profile, education: { ...profile.education, start_date: "2020-08", end_date: "2024-05" } }, fields: [
    { fieldKey: "name-only", label: "Name", type: "text" },
    { fieldKey: "start-month", label: "Education Start Date Month", type: "select", options: ["Month...", "January", "August"] },
    { fieldKey: "end-year", label: "Education End Date Year", type: "select", options: ["Year...", "2023", "2024"] },
] });
assert.deepEqual(educationPlan.answers.map(answer => answer.value), ["Avery Ng", "August", "2024"]);
const incompleteDate = createDeterministicFillPlan({ profile: { ...profile, education: { start_date: "2020" } }, fields: [
    { fieldKey: "month", label: "Education Start Date Month", type: "select", options: ["January", "August"] },
] });
assert.equal(incompleteDate.answers[0].action, "ask_user");
const ashbyPlan = createDeterministicFillPlan({ profile, fields: [
    { fieldKey: "ashby-location", label: "Location", type: "combobox" },
    { fieldKey: "ashby-sponsor", label: "Will you now or in the future require Notion to sponsor an immigration case in order to employ you?", type: "select", options: ["Yes", "No"] },
] });
assert.equal(ashbyPlan.answers.find(answer => answer.fieldKey === "ashby-location").value, "Austin");
assert.equal(ashbyPlan.answers.find(answer => answer.fieldKey === "ashby-sponsor").value, "No");
