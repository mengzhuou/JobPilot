const assert = require("node:assert/strict");
const { mapProfileForAutofill, validateEditableProfile } = require("./autofillProfileMapper");

const editableProfile = {
    personal: {
        firstName: "Avery", lastName: "Ng", email: "avery@example.com", phone: "555-0100",
        addressLine: "1 Main Street", city: "Austin", state: "Texas", country: "United States", postalCode: "78701",
        links: [{ label: "LinkedIn", href: "https://linkedin.com/in/avery" }],
    },
    education: [{ school: "Example University", degree: "Bachelor of Science in Computer Science", gpa: "3.8", from: "2020-08", to: "2024-05" }],
    experience: [
        { company: "Example Co", title: "Software Engineer", from: "2024-06", to: "Present", current: true },
        { company: "Intern Co", title: "Engineering Intern", from: "2023-06", to: "2023-08" },
    ],
    skills: ["TypeScript", "React"],
    preferences: [["Seeking", ["Full-time"]], ["Earliest start date", "2026-01-01"], ["Office preference", "2-4 days per week"], ["Preferred application location", "Austin, Texas"]],
    equalEmployment: [["Authorized to work in the United States", "Yes"], ["Requires employment sponsorship", "No"], ["Citizenship status", "U.S. lawful permanent resident"], ["Gender", "Choose not to disclose"], ["Race", "Asian"], ["Veteran status", "Not a protected veteran"], ["Disability", "No"], ["Sexual orientation", "Heterosexual"], ["Transgender experience", "No"]],
};

const { profile, missing } = mapProfileForAutofill(editableProfile);
assert.deepEqual(missing, []);
assert.equal(profile.candidate.name, "Avery Ng");
assert.equal(profile.candidate.location.city, "Austin");
assert.equal(profile.education.school, "Example University");
assert.equal(profile.career.current_company, "Example Co");
assert(profile.experience.total_professional_software_engineering_years > 1);
assert.equal(profile.work_authorization.authorized_to_work_without_sponsorship, true);
assert.equal(profile.application_answers.preferred_application_location, "Austin, Texas");
assert(profile.Q_and_A.self_introduction.answer);
assert(validateEditableProfile({ personal: {}, education: [] }).includes("email"));
console.log("Autofill Profile mapping checks passed.");
