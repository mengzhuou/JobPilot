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
    equalEmployment: [["Authorized to work in the United States", "Yes"], ["Requires employment sponsorship", "No"], ["Citizenship status", "U.S. lawful permanent resident"], ["Gender", "Choose not to disclose"], ["Hispanic or Latino", "No"], ["Race", "Asian"], ["Veteran status", "Not a protected veteran"], ["Disability", "No"], ["Sexual orientation", "Heterosexual"], ["Transgender experience", "No"]],
};

const { profile, missing } = mapProfileForAutofill(editableProfile);
assert.deepEqual(missing, []);
assert.equal(profile.candidate.name, "Avery Ng");
assert.equal(profile.candidate.location.city, "Austin");
assert.equal(profile.education.school, "Example University");
assert.equal(profile.career.current_company, "Example Co");
assert(profile.experience.total_professional_software_engineering_years > 1);
assert.equal(profile.work_authorization.authorized_to_work_without_sponsorship, true);
assert.equal(profile.work_authorization.requires_employment_sponsorship, false);
assert.equal(profile.work_authorization.has_saved_authorization_answer, true);
assert.equal(profile.work_authorization.has_saved_sponsorship_answer, true);
assert.equal(profile.eeoc.hispanic_latino.answer, "No");
assert.equal(profile.application_answers.preferred_application_location, "Austin, Texas");
assert(profile.Q_and_A.self_introduction.answer);
assert(validateEditableProfile({ personal: {}, education: [] }).includes("email"));

const { createDeterministicFillPlan } = require('./extensionAutofillPlanner');
const immigrationLabel = 'Currently have an active immigration case (e.g. H-1B extension or green card)';
const interviewLabel = 'Preferred programming language for interviews';
const savedProfile = (caseAnswer = 'Yes') => mapProfileForAutofill({
    ...editableProfile,
    education: [{school:'Example University',degree:'Bachelor of Science',fieldOfStudy:'Computer Science',from:'Aug 2022',to:'December 2024'}],
    preferences: [...editableProfile.preferences, [interviewLabel,'Python']],
    equalEmployment: [...editableProfile.equalEmployment, [immigrationLabel,caseAnswer]],
}).profile;
const saved = savedProfile();
assert.equal(saved.education.field_of_study, 'Computer Science');
assert.equal(saved.education.start_date, '2022-08');
assert.equal(saved.education.end_date, '2024-12');
assert.equal(profile.education.field_of_study, 'Computer Science', 'Legacy combined degree titles still supply an explicit major');
const applicationFields = [
    {fieldKey:'major',label:'Field of Study',type:'text'},
    ...['Start','End'].flatMap(part => ['Month','Year'].map(unit => ({fieldKey:`${part}-${unit}`,label:`Education ${part} Date ${unit}`,type:'combobox'}))),
    {fieldKey:'language',label:'What is your preferred programming language for interviews?',type:'combobox',options:['Java','Python','C++']},
    {fieldKey:'case',label:'Do you currently have an active immigration case (ex H-1B extension, green card)?',type:'radio',options:['Yes','No']},
];
const planned = createDeterministicFillPlan({profile:saved,fields:applicationFields}).answers;
assert.deepEqual(planned.map(answer=>answer.value), ['Computer Science','August','2022','December','2024','Python','Yes']);
assert.ok(planned.every(answer=>answer.action === 'fill'));
assert.equal(planned.at(-1).sensitive,true);
const caseField = applicationFields.at(-1);
for (const [input,expected] of [['No','False'],['Yes','True'],['',''],['unsure','']]) {
    const answer = createDeterministicFillPlan({profile:savedProfile(input),fields:[{...caseField,options:['True','False']}]}).answers[0];
    assert.equal(answer.value,expected);
    assert.equal(answer.action, expected ? 'fill' : 'ask_user');
}
for (const label of ['Which programming language do you prefer for the interview?', 'Which language would you use for coding interviews?']) {
    assert.equal(createDeterministicFillPlan({profile:saved,fields:[{...applicationFields.at(-2),label}]}).answers[0].value,'Python');
}
assert.equal(createDeterministicFillPlan({profile:saved,fields:[{...caseField,label:'Do you have a pending immigration petition?'}]}).answers[0].value,'Yes');
const unset = createDeterministicFillPlan({profile,fields:applicationFields.slice(-2)}).answers;
assert.ok(unset.every(answer=>answer.action === 'ask_user' && !answer.value), 'Neither skills nor citizenship/sponsorship imply the new saved answers');
const wrongOption = createDeterministicFillPlan({profile:saved,fields:[{...applicationFields.at(-2),options:['Java','C++']}]}).answers[0];
assert.equal(wrongOption.action,'ask_user', 'Do not choose another interview language');
const existingAnswer = createDeterministicFillPlan({profile:saved,fields:[{...applicationFields.at(-2),filled:true,currentValue:'Java'}]}).answers[0];
assert.equal(existingAnswer.action,'skip');
for (const [from,to,expectedStart,expectedEnd] of [['2022-08','2024-12','2022-08','2024-12'],['2022','Present','2022',''],['invalid','2024-13','','']]) {
    const mapped = mapProfileForAutofill({...editableProfile,education:[{...editableProfile.education[0],from,to,fieldOfStudy:''}]}).profile;
    assert.equal(mapped.education.start_date,expectedStart);
    assert.equal(mapped.education.end_date,expectedEnd);
    assert.equal(mapped.education.field_of_study,'', 'An explicitly cleared major stays blank');
}
console.log("Autofill Profile mapping checks passed.");
