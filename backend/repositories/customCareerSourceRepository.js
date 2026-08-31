const { pool } = require("../config/postgres");
const curatedCareerSources = require("../services/companyCareerSources");

const KNOWN_COMPANIES = {
    google: ["Google", "https://www.google.com/about/careers/applications/jobs/results/", "google"],
    apple: ["Apple", "https://jobs.apple.com/en-us/search", "generic"],
    amazon: ["Amazon", "https://www.amazon.jobs/en/search", "generic"],
    intuit: ["Intuit", "https://jobs.intuit.com/search-jobs", "generic"],
    "omada health": ["Omada Health", "https://boards.greenhouse.io/omadahealth", "greenhouse", "omadahealth"],
    uber: ["Uber", "https://jobs.uber.com/en/jobs/", "oracle-uber", "UberCareers"],
    netflix: ["Netflix", "https://explore.jobs.netflix.net/careers", "eightfold", "netflix.com"],
    bloomberg: ["Bloomberg", "https://bloomberg.avature.net/careers/SearchJobs/?search=software%20engineer", "generic"],
    linkedin: ["LinkedIn", "https://www.linkedin.com/jobs/search/?f_C=1337&geoId=103644278&keywords=software%20engineer", "generic"],
};

const normalizeCompanyName = value => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getCuratedSourceByName = input => curatedCareerSources.find(source =>
    normalizeCompanyName(source.company) === normalizeCompanyName(input)
);

const getCareerUrl = source => source.careerUrl || (
    source.provider === "ashby" ? `https://jobs.ashbyhq.com/${source.board}`
        : source.provider === "greenhouse" ? `https://boards.greenhouse.io/${source.board}`
            : source.provider === "lever" ? `https://jobs.lever.co/${source.board}`
                : null
);

const resolveSource = input => {
    const trimmed = String(input || "").trim();
    if (!trimmed) throw Object.assign(new Error("Enter a company name or career URL"), { statusCode: 400 });
    const known = KNOWN_COMPANIES[normalizeCompanyName(trimmed)];
    const curated = getCuratedSourceByName(trimmed);
    let company;
    let careerUrl;
    let provider;
    let board = null;

    if (curated) {
        company = curated.company;
        careerUrl = getCareerUrl(curated);
        provider = curated.provider;
        board = curated.board || null;
    } else if (known) {
        [company, careerUrl, provider, board = null] = known;
    } else {
        try {
            const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
            careerUrl = url.toString();
            company = url.hostname.replace(/^www\./, "").split(".")[0]
                .replace(/(^|[-_])\w/g, value => value.replace(/[-_]/, " ").toUpperCase());
            const pathParts = url.pathname.split("/").filter(Boolean);
            if (/greenhouse\.io$/i.test(url.hostname)) {
                provider = "greenhouse";
                board = pathParts[0];
            } else if (/ashbyhq\.com$/i.test(url.hostname)) {
                provider = "ashby";
                board = pathParts[0];
            } else if (/lever\.co$/i.test(url.hostname)) {
                provider = "lever";
                board = pathParts[0];
            } else if (/google\.com$/i.test(url.hostname) && /careers/.test(url.pathname)) {
                company = "Google";
                provider = "google";
            } else if (/jobs\.uber\.com$/i.test(url.hostname)) {
                company = "Uber";
                provider = "oracle-uber";
                board = "UberCareers";
            } else if (/^(?:explore\.)?jobs\.netflix\.(?:com|net)$/i.test(url.hostname)) {
                company = "Netflix";
                careerUrl = "https://explore.jobs.netflix.net/careers";
                provider = "eightfold";
                board = "netflix.com";
            } else if (/eightfold\.ai$/i.test(url.hostname)) {
                provider = "eightfold";
                board = url.hostname.split(".")[0];
            } else {
                provider = "generic";
            }
        } catch {
            throw Object.assign(new Error(`Company "${trimmed}" is not in the verified catalog yet. Paste its official careers URL so JobPilot can validate it.`), { statusCode: 400 });
        }
    }
    return { company, careerUrl, provider, board, originalInput: trimmed };
};

const addCustomCareerSource = async (userId, input) => {
    const source = resolveSource(input);
    return addResolvedCareerSource(userId, source, input);
};

const addResolvedCareerSource = async (userId, source, originalInput = source.originalInput) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.custom_career_sources
            (submitted_by, company, career_url, provider, board, original_input)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (career_url) DO UPDATE SET status = 'active', updated_at = NOW()
         RETURNING *`,
        [userId, source.company, source.careerUrl, source.provider, source.board, originalInput]
    );
    return result.rows[0];
};

const listCustomCareerSources = async () => {
    const result = await pool.query(
        `SELECT company, provider, board, career_url AS "careerUrl", 'community' AS group
         FROM jobpilot.custom_career_sources WHERE status = 'active' ORDER BY company`
    );
    const supportedProviders = new Set(["ashby", "greenhouse", "lever", "google", "generic", "oracle-uber", "eightfold"]);
    const seen = new Set();
    return result.rows.map(source => ({
        ...source,
        provider: String(source.provider || "").trim().replace(/^g+greenhouse$/, "greenhouse"),
    })).filter(source => {
        if (!supportedProviders.has(source.provider)) return false;
        try {
            const hostname = new URL(source.careerUrl).hostname;
            if (!hostname.includes(".")) return false;
        } catch { return false; }
        const key = `${normalizeCompanyName(source.company)}:${source.provider}:${source.board || source.careerUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

module.exports = { addCustomCareerSource, addResolvedCareerSource, listCustomCareerSources, resolveSource };
