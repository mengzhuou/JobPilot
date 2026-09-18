const profileFixture = {
    personal: {
        name: "Mengzhu Ou",
        firstName: "Mengzhu",
        middleName: "",
        lastName: "Ou",
        email: "a1106983163@gmail.com",
        phone: "(706) 741-8456",
        phoneType: "Mobile",
        address: "10732 Craven St, McKinney, Texas, United States",
        addressLine: "10732 Craven St",
        city: "McKinney",
        state: "Texas",
        country: "United States",
        postalCode: "75072",
        links: [
            { label:"LinkedIn", value:"linkedin.com/in/mengzhuou", href:"https://www.linkedin.com/in/mengzhuou/" },
            { label:"GitHub", value:"github.com/MengzhuOu", href:"https://github.com/MengzhuOu" },
            { label:"Portfolio", value:"github.com/MengzhuOu", href:"https://github.com/MengzhuOu" },
        ],
    },
    education: [{
        school:"Georgia Institute of Technology",
        degree:"Bachelor of Science in Computer Science",
        location:"Atlanta, GA",
        from:"Aug 2022",
        to:"Dec 2024",
        gpa:"3.95",
        details:["GPA 3.95"],
    }],
    experience: [
        { company:"Walmart Global Tech", title:"Software Engineer III", location:"Bentonville, AR", from:"Sep 2026", to:"Present", bullets:[
            "Lead frontend solution design for enterprise financial applications, using Redux and React Context to structure shared state while refactoring duplicated React components into reusable, testable, and maintainable modules.",
            "Build React and Java features end to end, translating product requirements into technical designs, backend services, and reliable financial workflows.",
            "Design and implement MySQL stored procedures on Azure Database to support server-side financial data processing and application integrations.",
            "Own production releases through LooperPro CI/CD pipelines, monitoring Kubernetes deployments, validating application health, and troubleshooting release failures.",
        ]},
        { company:"Walmart Global Tech", title:"Software Engineer II", location:"Bentonville, AR", from:"Feb 2025", to:"Sep 2026", bullets:[
            "Developed key frontend features for enterprise financial applications using React, integrating with Python-based microservices deployed on Kubernetes while optimizing API requests and data rendering performance.",
            "Developed core pivoting UI components for an Excel Add-in financial analytics application and complex event-driven financial workflows.",
            "Deployed, monitored, and troubleshot Kubernetes services, resolving production incidents and improving system reliability.",
            "Automated testing with Playwright and maintained 80%+ coverage with Jest and PyTest in LooperPro CI/CD pipelines.",
        ]},
        { company:"Walmart Global Tech", title:"Software Engineer Intern", location:"Bentonville, AR", from:"Jun 2024", to:"Aug 2024", bullets:[
            "Improved React development speed by 20% and achieved 85% test coverage through test-driven development with Jest and Playwright.",
            "Improved demand-scenario analysis efficiency by 50% while reducing server errors by 30%.",
        ]},
        { company:"Travelers", title:"Technology Leadership Development Program", location:"", from:"Jun 2023", to:"Aug 2023", bullets:[
            "Built React and Java features using test-driven development and Jenkins CI/CD, improving feature-change analysis efficiency by 25% for MergeMania.",
        ]},
        { company:"MessageGears", title:"Software Engineer Intern", location:"Atlanta, GA", from:"Jan 2023", to:"May 2023", bullets:[
            "Developed Java backend services with server-side validation and Mockito tests, improving data integrity and regression protection.",
        ]},
    ],
    skills: {
        Languages:["Python","Java","JavaScript","TypeScript","SQL"],
        Frontend:["React","Redux","React Context","HTML","CSS"],
        "Backend & Cloud":["Node.js","Express.js","REST APIs","Microservices","Docker","Kubernetes","AWS"],
        "Data & Tools":["Git","Jira","Playwright","SonarQube","Jest","PyTest","MongoDB","MySQL"],
    },
    preferences: [
        ["Seeking", "Full-time roles"],
        ["Earliest start date", "Nov 1, 2026"],
        ["Office preference", "2-4 days per week"],
        ["Preferred application location", "Dallas, Texas, United States"],
    ],
    equalEmployment: [
        ["Authorized to work in the United States", "Yes"],
        ["Requires employment sponsorship", "No"],
        ["Citizenship status", "U.S. lawful permanent resident"],
        ["Gender", "Female"],
        ["Race", "Asian"],
        ["Veteran status", "Not a protected veteran"],
        ["Disability", "No"],
        ["Sexual orientation", "Heterosexual"],
        ["Transgender experience", "No"],
    ],
};

export default profileFixture;
