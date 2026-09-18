const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const source = require("../services/profile.json");
const { pool } = require("../config/postgres");
const repo = require("../repositories/userProfileRepository");

const profile = {
    personal: {
        name: source.candidate.name,
        firstName: source.candidate.first_name,
        middleName: "",
        lastName: source.candidate.last_name,
        email: source.candidate.email,
        phone: source.candidate.phone,
        phoneType: "Mobile",
        address: [source.candidate.location.address_line_1, source.candidate.location.city, source.candidate.location.state, source.candidate.location.country].filter(Boolean).join(", "),
        addressLine: source.candidate.location.address_line_1,
        city: source.candidate.location.city,
        state: source.candidate.location.state,
        country: source.candidate.location.country,
        postalCode: "75072",
        links: Object.entries(source.candidate.links).map(([label, href]) => ({ label: label[0].toUpperCase() + label.slice(1), value: href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href })),
    },
    education: [{ school: source.education.school, degree: `${source.education.highest_level} in ${source.education.field_of_study}`, location: "Atlanta, GA", from: "Aug 2022", to: "Dec 2024", gpa:"3.95", details: ["GPA 3.95"] }],
    experience: [
        { company:"Walmart Global Tech", title:"Software Engineer III", location:"Bentonville, AR", from:"Sep 2026", to:"Present", bullets:["Lead frontend solution design for enterprise financial applications, using Redux and React Context to structure shared state while refactoring duplicated React components into reusable, testable, and maintainable modules.","Build React and Java features end to end, translating product requirements into technical designs, backend services, and reliable financial workflows.","Design and implement MySQL stored procedures on Azure Database to support server-side financial data processing and application integrations.","Own production releases through LooperPro CI/CD pipelines, monitoring Kubernetes deployments, validating application health, and troubleshooting release failures."] },
        { company:"Walmart Global Tech", title:"Software Engineer II", location:"Bentonville, AR", from:"Feb 2025", to:"Sep 2026", bullets:["Developed key frontend features for enterprise financial applications using React, integrating with Python-based microservices deployed on Kubernetes while optimizing API requests and data rendering performance.","Developed core pivoting UI components for an Excel Add-in financial analytics application and complex event-driven financial workflows.","Deployed, monitored, and troubleshot Kubernetes services, resolving production incidents and improving system reliability.","Automated testing with Playwright and maintained 80%+ coverage with Jest and PyTest in LooperPro CI/CD pipelines."] },
        { company:"Walmart Global Tech", title:"Software Engineer Intern", location:"Bentonville, AR", from:"Jun 2024", to:"Aug 2024", bullets:["Improved React development speed by 20% and achieved 85% test coverage through test-driven development with Jest and Playwright.","Improved demand-scenario analysis efficiency by 50% while reducing server errors by 30%."] },
        { company:"Travelers", title:"Technology Leadership Development Program", location:"", from:"Jun 2023", to:"Aug 2023", bullets:["Built React and Java features using test-driven development and Jenkins CI/CD, improving feature-change analysis efficiency by 25% for MergeMania."] },
        { company:"MessageGears", title:"Software Engineer Intern", location:"Atlanta, GA", from:"Jan 2023", to:"May 2023", bullets:["Developed Java backend services with server-side validation and Mockito tests, improving data integrity and regression protection."] },
    ],
    skills: [...new Set([...Object.values(source.skills).flat(), "TypeScript", "React Context", "HTML", "CSS", "REST APIs", "Microservices", "Docker", "AWS", "Git", "Jira", "Playwright", "PyTest"])],
    preferences: [
        ["Seeking", source.job_preferences.applying_for_full_time ? "Full-time roles" : "Internship or co-op roles"],
        ["Earliest start date", source.job_preferences.earliest_start_date],
        ["Office preference", source.job_preferences.office_days_per_week_form_option],
        ["Preferred application location", source.application_answers.preferred_application_location],
    ],
    equalEmployment: [
        ["Authorized to work in the United States", source.work_authorization.authorized_to_work_without_sponsorship ? "Yes" : "No"],
        ["Requires employment sponsorship", source.work_authorization.authorized_to_work_without_sponsorship ? "No" : "Yes"],
        ["Citizenship status", source.work_authorization.citizenship_status_form_options[2]],
        ["Gender", source.eeoc.gender.answer],
        ["Race", source.eeoc.race.answer],
        ["Veteran status", source.eeoc.veteran_status.answer],
        ["Disability", source.eeoc.disability_status.answer],
        ["Sexual orientation", source.eeoc.sexual_orientation.answer],
        ["Transgender experience", source.eeoc.transgender_status.answer],
    ],
};

const seed = async () => {
    const user = await pool.query("SELECT id FROM jobpilot.users WHERE LOWER(email)=LOWER($1)", [source.candidate.email]);
    if (!user.rows[0]) throw new Error(`No JobPilot user exists for ${source.candidate.email}`);
    await repo.upsert(user.rows[0].id, profile);
    console.log(`Profile imported for ${source.candidate.email}`);
    await pool.end();
};

seed().catch(error => {
    console.error("Unable to import profile:", error.message);
    process.exitCode = 1;
});
