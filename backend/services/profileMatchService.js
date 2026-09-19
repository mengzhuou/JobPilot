const JOB_SKILLS = [
    ["Java", ["Java"]], ["Python", ["Python"]], ["C++", ["C++"]], ["C#", ["C#"]],
    ["Go", ["Golang", "Go"]], ["Ruby", ["Ruby"]], ["PHP", ["PHP"]], ["Swift", ["Swift"]],
    ["Kotlin", ["Kotlin"]], ["JavaScript", ["JavaScript"]], ["TypeScript", ["TypeScript"]],
    ["React", ["React"]], ["Angular", ["Angular"]], ["Vue.js", ["Vue.js", "Vue"]],
    ["Node.js", ["Node.js", "NodeJS"]], ["Express.js", ["Express.js", "ExpressJS"]],
    ["Django", ["Django"]], ["Flask", ["Flask"]], ["Spring Boot", ["Spring Boot"]],
    [".NET", [".NET"]], ["HTML", ["HTML"]], ["CSS", ["CSS"]], ["SQL", ["SQL"]],
    ["PostgreSQL", ["PostgreSQL", "Postgres"]], ["MySQL", ["MySQL"]], ["MongoDB", ["MongoDB"]],
    ["Redis", ["Redis"]], ["DynamoDB", ["DynamoDB"]], ["Snowflake", ["Snowflake"]],
    ["REST APIs", ["REST APIs", "REST API", "RESTful"]], ["GraphQL", ["GraphQL"]],
    ["Microservices", ["Microservices", "Microservice Architecture"]], ["AWS", ["AWS", "Amazon Web Services"]],
    ["Microsoft Azure", ["Microsoft Azure", "Azure"]], ["Google Cloud Platform", ["Google Cloud Platform", "GCP"]],
    ["Docker", ["Docker"]], ["Kubernetes", ["Kubernetes"]], ["Terraform", ["Terraform"]],
    ["Git", ["Git"]], ["CI/CD", ["CI/CD", "Continuous Integration", "Continuous Deployment"]],
    ["Jenkins", ["Jenkins"]], ["GitHub Actions", ["GitHub Actions"]], ["Playwright", ["Playwright"]],
    ["Jest", ["Jest"]], ["PyTest", ["PyTest"]], ["Kafka", ["Kafka"]], ["Spark", ["Apache Spark", "Spark"]],
    ["ETL", ["ETL"]], ["Data Modeling", ["Data Modeling"]], ["Data Pipelines", ["Data Pipelines", "Data Pipeline"]],
    ["Machine Learning", ["Machine Learning", "ML"]], ["Artificial Intelligence", ["Artificial Intelligence", "AI"]],
    ["Data Structures and Algorithms", ["Data Structures and Algorithms", "Algorithms"]],
    ["System Design", ["System Design"]], ["Cloud Computing", ["Cloud Computing", "Cloud Services"]],
    ["Agile", ["Agile"]], ["Scrum", ["Scrum"]], ["Communication", ["Communication"]],
    ["Teamwork", ["Teamwork", "Team Work"]], ["Problem Solving", ["Problem Solving", "Problem-Solving"]],
];
const ROLE_FAMILIES = [
    ["frontend", /\b(?:front[ -]?end|react|angular|vue|ui engineer)\b/i],
    ["backend", /\b(?:back[ -]?end|server[ -]?side|api engineer)\b/i],
    ["full-stack", /\bfull[ -]?stack\b/i],
    ["data", /\b(?:data engineer|analytics engineer|data platform)\b/i],
    ["cloud", /\b(?:cloud|devops|site reliability|sre|infrastructure|platform engineer)\b/i],
    ["mobile", /\b(?:mobile|ios|android)\b/i],
    ["embedded", /\b(?:embedded|firmware|hardware|rtos)\b/i],
    ["ai", /\b(?:artificial intelligence|machine learning|ai engineer|ml engineer)\b/i],
    ["security", /\b(?:security|cybersecurity)\b/i],
    ["software", /\b(?:software engineer|software developer|application developer)\b/i],
];
const INDUSTRY_DOMAINS = [
    ["advertising", /\b(?:advertising|adtech|marketing technology)\b/i],
    ["automotive", /\b(?:automotive|autonomous vehicle|mobility)\b/i],
    ["commerce", /\b(?:e-?commerce|retail|marketplace)\b/i],
    ["cybersecurity", /\b(?:cybersecurity|information security|threat detection)\b/i],
    ["defense", /\b(?:defense|aerospace|military)\b/i],
    ["finance", /\b(?:fintech|financial services|banking|payments)\b/i],
    ["healthcare", /\b(?:healthcare|health tech|medical|clinical)\b/i],
    ["manufacturing", /\b(?:manufacturing|industrial|factory)\b/i],
    ["media", /\b(?:media|streaming|video|gaming)\b/i],
    ["robotics", /\b(?:robotics|robot|physical ai)\b/i],
];

const plain = value => String(value || "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\.(?=\s|$)/g, "").trim();
const values = value => Array.isArray(value) ? value.flatMap(values) : value && typeof value === "object" ? Object.values(value).flatMap(values) : value ? [String(value)] : [];
const hasPhrase = (text, phrase) => {
    const normalized = plain(phrase);
    return normalized.length > 1 && (` ${plain(text)} `).includes(` ${normalized} `);
};
const uniqueSkills = skills => [...new Map(skills.filter(Boolean).map(skill => [plain(skill), skill])).values()];
const isCatalogEquivalent = (profileSkill, label, aliases) => {
    const normalizedProfileSkill = plain(profileSkill);
    return [label, ...aliases].some(candidate => plain(candidate) === normalizedProfileSkill);
};

const percentage = value => Math.max(0, Math.min(100, Math.round(value)));
const dateValue = value => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const profileExperienceYears = experience => {
    const ranges = (Array.isArray(experience) ? experience : []).map(item => {
        const start = dateValue(item.from || item.startDate || item.start);
        const end = item.current ? new Date() : dateValue(item.to || item.endDate || item.end) || new Date();
        return start && end >= start ? [start.getTime(), end.getTime()] : null;
    }).filter(Boolean).sort((first, second) => first[0] - second[0]);
    const merged = ranges.reduce((result, range) => {
        const previous = result[result.length - 1];
        if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
        else result.push([...range]);
        return result;
    }, []);
    const milliseconds = merged.reduce((total, [start, end]) => total + end - start, 0);
    return Math.round((milliseconds / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
};
const requiredExperienceYears = job => {
    const text = jobText(job);
    const explicit = [...text.matchAll(/(?:minimum(?: of)?|at least)?\s*(\d{1,2})(?:\s*[-–—+]\s*\d{1,2})?\+?\s*years?(?:\s+of)?\s+(?:professional\s+)?experience/gi)]
        .map(match => Number(match[1])).filter(Number.isFinite);
    if (explicit.length) return Math.max(...explicit);
    if (/\b(?:intern|internship|new grad|graduate|entry[ -]?level|junior)\b/i.test(job.title || text)) return 0;
    if (/\bprincipal\b/i.test(job.title || "")) return 9;
    if (/\b(?:staff|lead)\b/i.test(job.title || "")) return 7;
    if (/\b(?:senior|sr\.?|manager)\b/i.test(job.title || "")) return 5;
    return null;
};
const requiredGraduationYears = job => {
    const text = jobText(job);
    const graduationClauses = text.split(/[.!?\n]+/).filter(clause => /\b(?:graduat(?:e|ing|ion)|class of|new grad)\b/i.test(clause));
    return [...new Set(graduationClauses.flatMap(clause => [...clause.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]))))];
};
const profileGraduationYears = education => [...new Set((Array.isArray(education) ? education : [])
    .map(item => dateValue(item.to || item.endDate || item.graduationDate)?.getFullYear())
    .filter(Number.isFinite))];
const experienceLevelMatch = (job, experience, education) => {
    const candidateYears = profileExperienceYears(experience);
    const requiredYears = requiredExperienceYears(job);
    const graduationYears = requiredGraduationYears(job);
    const candidateGraduationYears = profileGraduationYears(education);
    if (graduationYears.length) {
        const graduationMatches = graduationYears.some(year => candidateGraduationYears.includes(year));
        return {
            percentage: graduationMatches ? 100 : 0,
            candidateYears,
            requiredYears,
            graduationYears,
            candidateGraduationYears,
            hardMismatch: !graduationMatches,
        };
    }
    if (requiredYears === null) return { percentage: candidateYears > 0 ? 75 : 35, candidateYears, requiredYears, hardMismatch: false };
    if (requiredYears === 0) return { percentage: 100, candidateYears, requiredYears, hardMismatch: false };
    return { percentage: percentage((candidateYears / requiredYears) * 100), candidateYears, requiredYears, hardMismatch: false };
};
const industryMatch = (job, profile) => {
    const jobBackground = jobText(job);
    const background = [
        ...values(profile.experience),
        ...values(profile.skills),
        ...values(profile.education),
    ].join(" ");
    const jobFamilies = ROLE_FAMILIES.filter(([, pattern]) => pattern.test(jobBackground)).map(([name]) => name);
    const profileFamilies = ROLE_FAMILIES.filter(([, pattern]) => pattern.test(background)).map(([name]) => name);
    const roleFit = jobFamilies.some(family => profileFamilies.includes(family)) ? 70 : 0;
    const jobDomains = INDUSTRY_DOMAINS.filter(([, pattern]) => pattern.test(jobBackground)).map(([name]) => name);
    const profileDomains = INDUSTRY_DOMAINS.filter(([, pattern]) => pattern.test(background)).map(([name]) => name);
    const domainFit = jobDomains.length
        ? (jobDomains.filter(domain => profileDomains.includes(domain)).length / jobDomains.length) * 30
        : (roleFit ? 15 : 0);
    return percentage(roleFit + domainFit);
};

const buildBreakdown = ({ skillPercentage = 0, experience = {}, industryPercentage = 0, matchedSkillCount = 0, jobSkillCount = 0 } = {}) => [
    {
        key: "skills",
        label: "Skills",
        weight: 45,
        percentage: skillPercentage,
        detail: jobSkillCount
            ? `${matchedSkillCount} of ${jobSkillCount} detected job skills match your Profile.`
            : "No relevant Profile skills match yet. Select the skills you have below.",
    },
    {
        key: "experience",
        label: "Experience level",
        weight: 35,
        percentage: experience.percentage || 0,
        detail: experience.graduationYears?.length
            ? `Your Profile graduation year${experience.candidateGraduationYears?.length === 1 ? " is" : "s are"} ${experience.candidateGraduationYears?.join(", ") || "not provided"}; this job requires ${experience.graduationYears.join(" or ")}.`
            : experience.requiredYears === null
            ? `${experience.candidateYears || 0} years found in your Profile; this job has no clear minimum.`
            : `Your Profile shows ${experience.candidateYears || 0} years; this job asks for ${experience.requiredYears}+ years.`,
    },
    {
        key: "industry",
        label: "Industry experience",
        weight: 20,
        percentage: industryPercentage,
        detail: industryPercentage >= 70
            ? "Your role history and domain background align well with this job."
            : "Add accurate role descriptions and domain experience to your Profile.",
    },
];

const jobText = job => [job.title, job.company, job.location, ...(job.tags || []), job.summary, ...(job.requirements || [])]
    .filter(Boolean).join(" ");

const getMatchLevel = score => score >= 90 ? "strong" : score >= 70 ? "good" : score >= 60 ? "fair" : "bad";

const scoreJobForProfile = (job, profile) => {
    if (!profile) return { score: 0, level: "bad", matchedSkills: [], jobSkills: [], breakdown: buildBreakdown() };
    const text = jobText(job);
    const skills = [...new Set(values(profile.skills).map(item => item.trim()).filter(item => item.length > 1))];
    const catalogSkillsInJob = JOB_SKILLS.filter(([, aliases]) => aliases.some(alias => hasPhrase(text, alias)));
    const matchedCatalogSkills = catalogSkillsInJob
        .filter(([label, aliases]) => skills.some(skill => isCatalogEquivalent(skill, label, aliases)))
        .map(([label]) => label);
    const customMatchedSkills = skills.filter(skill => hasPhrase(text, skill));
    const matchedSkills = uniqueSkills([...matchedCatalogSkills, ...customMatchedSkills]);
    const jobSkills = uniqueSkills([
        ...catalogSkillsInJob.map(([label]) => label),
        ...customMatchedSkills,
    ]);
    const experience = Array.isArray(profile.experience) ? profile.experience : [];
    const skillPercentage = jobSkills.length ? percentage((matchedSkills.length / jobSkills.length) * 100) : 0;
    const experienceMatch = experienceLevelMatch(job, experience, profile.education);
    const industryPercentage = industryMatch(job, profile);
    const weightedScore = percentage((skillPercentage * .45) + (experienceMatch.percentage * .35) + (industryPercentage * .20));
    const finalScore = experienceMatch.hardMismatch ? Math.min(59, weightedScore) : weightedScore;
    return {
        score: finalScore,
        level: getMatchLevel(finalScore),
        matchedSkills,
        jobSkills,
        breakdown: buildBreakdown({
            skillPercentage,
            experience: experienceMatch,
            industryPercentage,
            matchedSkillCount: matchedSkills.length,
            jobSkillCount: jobSkills.length,
        }),
    };
};

const rankJobsForProfile = (jobs, profile) => [...jobs]
    .map(job => ({ ...job, profileMatch: scoreJobForProfile(job, profile) }))
    .sort((first, second) => second.profileMatch.score - first.profileMatch.score
        || new Date(second.postedAt || 0).getTime() - new Date(first.postedAt || 0).getTime()
        || String(first.title || "").localeCompare(String(second.title || "")));

module.exports = { scoreJobForProfile, rankJobsForProfile, getMatchLevel };
