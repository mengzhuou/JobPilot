const { pool } = require("../config/postgres");

const KNOWN_COMPANIES = {
    google: ["Google", "https://www.google.com/about/careers/applications/jobs/results/", "google"],
    apple: ["Apple", "https://jobs.apple.com/en-us/search", "generic"],
    amazon: ["Amazon", "https://www.amazon.jobs/en/search", "generic"],
    intuit: ["Intuit", "https://jobs.intuit.com/search-jobs", "generic"],
};

const resolveSource = input => {
    const trimmed = String(input || "").trim();
    if (!trimmed) throw Object.assign(new Error("Enter a company name or career URL"), { statusCode: 400 });
    const known = KNOWN_COMPANIES[trimmed.toLowerCase()];
    let company;
    let careerUrl;
    let provider;
    let board = null;

    if (known) {
        [company, careerUrl, provider] = known;
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
            } else {
                provider = "generic";
            }
        } catch {
            throw Object.assign(new Error("Use a supported company name or a valid URL"), { statusCode: 400 });
        }
    }
    return { company, careerUrl, provider, board, originalInput: trimmed };
};

const addCustomCareerSource = async (userId, input) => {
    const source = resolveSource(input);
    const result = await pool.query(
        `INSERT INTO jobpilot.custom_career_sources
            (submitted_by, company, career_url, provider, board, original_input)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (career_url) DO UPDATE SET status = 'active', updated_at = NOW()
         RETURNING *`,
        [userId, source.company, source.careerUrl, source.provider, source.board, source.originalInput]
    );
    return result.rows[0];
};

const listCustomCareerSources = async () => {
    const result = await pool.query(
        `SELECT company, provider, board, career_url AS "careerUrl", 'community' AS group
         FROM jobpilot.custom_career_sources WHERE status = 'active' ORDER BY company`
    );
    return result.rows;
};

module.exports = { addCustomCareerSource, listCustomCareerSources };
