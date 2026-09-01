const { getMarketSnapshot, saveMarketSnapshot } = require("../repositories/jobAnalyticsRepository");
const { refreshJobsForAnalytics } = require("../services/jobPostingService");

const CATEGORY_RULES = [
    ["Machine Learning / AI", /\b(?:machine learning|ml engineer|artificial intelligence|ai engineer|deep learning|computer vision|nlp|generative ai|llm)\b/i],
    ["Data Science", /\b(?:data scientist|data science|decision scientist|applied scientist|research scientist)\b/i],
    ["Hardware", /\b(?:hardware|electrical|firmware|silicon|asic|fpga|semiconductor|robotics|embedded|data center infrastructure)\b/i],
    ["Security", /\b(?:security|cybersecurity|application security|infosec|threat|identity and access)\b/i],
    ["Cloud / DevOps", /\b(?:devops|site reliability|sre|cloud|infrastructure|platform engineer|kubernetes)\b/i],
    ["Mobile", /\b(?:ios|android|mobile engineer|react native)\b/i],
    ["Web / Frontend", /\b(?:frontend|front-end|web engineer|web developer|ui engineer)\b/i],
    ["QA / Test", /\b(?:quality assurance|qa engineer|test engineer|sdet|automation engineer)\b/i],
    ["Software Engineering", /\b(?:software|developer|backend|back-end|full stack|fullstack|engineer)\b/i],
];

const classifyJobs = jobs => {
    const counts = new Map();
    jobs.forEach(job => {
        const text = [job.title, ...(job.tags || []), job.summary].filter(Boolean).join(" ");
        const category = CATEGORY_RULES.find(([,pattern]) => pattern.test(text))?.[0] || "Other";
        counts.set(category, (counts.get(category) || 0) + 1);
    });
    const total = jobs.length;
    return [...counts.entries()].map(([name,count]) => ({
        name,
        count,
        percentage:total ? Number(((count / total) * 100).toFixed(1)) : 0,
    })).sort((left,right) => right.count-left.count);
};

const toDistribution = values => {
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    const total = values.length;
    return [...counts.entries()].map(([name,count]) => ({
        name,
        count,
        percentage:total ? Number(((count / total) * 100).toFixed(1)) : 0,
    })).sort((left,right) => right.count-left.count);
};

const getPlatform = job => {
    const text = [job.provider,job.source,job.url].filter(Boolean).join(" ").toLowerCase();
    if (/greenhouse/.test(text)) return "Greenhouse";
    if (/lever/.test(text)) return "Lever";
    if (/ashby/.test(text)) return "Ashby";
    if (/oracle|oraclecloud|candidateexperience/.test(text)) return "Oracle Recruiting";
    if (/workday|myworkdayjobs/.test(text)) return "Workday";
    if (/linkedin/.test(text)) return "LinkedIn";
    if (/indeed/.test(text)) return "Indeed";
    if (/smartrecruiters/.test(text)) return "SmartRecruiters";
    if (/eightfold/.test(text)) return "Eightfold";
    if (/company career page|official career site|generic/.test(text)) return "Company career site";
    return job.provider ? String(job.provider).trim() : "Other";
};

const getSoftwareLevel = job => {
    const title = String(job.title || "").replace(/[–—]/g,"-").trim();
    if (/\b(?:intern|internship|co-?op)\b/i.test(title)) return "Intern";
    if (/\b(?:new\s*grad(?:uate)?|ng|recent\s+grad(?:uate)?)\b/i.test(title)) return "New Grad";
    if (/\bprincipal\b/i.test(title)) return "Principal";
    if (/\bstaffs?\b/i.test(title)) return "Staff";
    if (/\b(?:senior|sr\.?)\b/i.test(title)) return "Senior";
    if (/\b(?:director|head|manager|mgr\.?)\b/i.test(title)) return "Manager / Director";
    if (/\b(?:lead|tech(?:nical)?\s+lead)\b/i.test(title)) return "Lead";
    if (/\b(?:junior|jr\.?|entry[- ]level|early\s+career|associate)\b/i.test(title)
        || /(?:^|[\s(/-])(?:1|2|3|I|II|III)(?=$|[\s)/,-])/i.test(title)) return "Junior / Early Career";
    return "Unspecified / Mid-level";
};

const getSnapshot = async (req,res,next) => { try {
    res.json({ snapshot:await getMarketSnapshot() });
} catch(error){ next(error); } };

const refreshSnapshot = async (req,res,next) => { try {
    const catalog = await refreshJobsForAnalytics();
    const categories = classifyJobs(catalog.jobs);
    const platformCategories = toDistribution(catalog.jobs.map(getPlatform));
    const levelCategories = toDistribution(catalog.jobs.map(getSoftwareLevel));
    const snapshot = await saveMarketSnapshot({
        totalJobs:catalog.jobs.length,
        categories,
        platformCategories,
        levelCategories,
        sourceFetchedAt:new Date(catalog.fetchedAt),
        generatedBy:req.auth.userId,
    });
    res.json({ snapshot });
} catch(error){ next(error); } };

module.exports = { getSnapshot, refreshSnapshot };
