const companyCareerSources = require("./companyCareerSources");
const cheerio = require("cheerio");
const { listCustomCareerSources } = require("../repositories/customCareerSourceRepository");
const { getCachedJson, setCachedJson, deleteCachedValue } = require("../config/redis");

const SOFTWARE_JOB_PATTERN =
    /\b(software|frontend|front-end|backend|back-end|full[ -]?stack|web|mobile|ios|android|java|react|node(?:\.js)?|python|devops|cloud|platform|application|site reliability|data engineer)\b/i;
const ENGINEERING_PATTERN =
    /\b(engineer|engineering|developer|development|programmer|architect)\b/i;
const US_STATE_PATTERN =
    /(?:^|,\s*)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s|,|$)/i;
const US_LOCATION_PATTERN =
    /\b(US|USA|U\.S\.|United States|North America|Worldwide|Anywhere)\b/i;

const CACHE_TTL_SECONDS = Number(process.env.JOB_CACHE_TTL_SECONDS) || 10 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const REDIS_CACHE_KEY = "jobpilot:active-jobs:v1";
let cache = {
    jobs: [],
    fetchedAt: 0,
    sources: [],
};

const invalidateJobCache = () => {
    cache.fetchedAt = 0;
    void deleteCachedValue(REDIS_CACHE_KEY);
};

const fetchJson = async (url) => {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "JobPilot/1.0 (official career-site index)",
        },
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
};

const fetchHtml = async url => {
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 JobPilot/1.0" },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return response.text();
};

const flattenValues = (value) => {
    if (Array.isArray(value)) {
        return value.flatMap(flattenValues);
    }

    return value ? [String(value)] : [];
};

const isUnitedStatesLocation = (location) => {
    return (
        US_LOCATION_PATTERN.test(location || "") ||
        US_STATE_PATTERN.test(location || "")
    );
};

const isSoftwareEngineeringJob = (job) => {
    const searchableText = [
        job.title,
        ...(job.tags || []),
    ].join(" ");

    return (
        ENGINEERING_PATTERN.test(job.title || "") &&
        SOFTWARE_JOB_PATTERN.test(searchableText) &&
        isUnitedStatesLocation(job.location)
    );
};

const normalizeAshbyJobs = (payload, source) => {
    return (payload.jobs || []).map((job) => {
        const locationParts = [
            job.location,
            job.address?.postalAddress?.addressCountry,
            ...(job.secondaryLocations || []).flatMap((item) => [
                item.location,
                item.address?.addressCountry,
            ]),
        ].filter(Boolean);

        return {
            id: `ashby-${source.board}-${job.id}`,
            title: job.title,
            company: source.company,
            location: [...new Set(locationParts)].join(" · "),
            remote:
                Boolean(job.isRemote) ||
                /remote/i.test(job.location || ""),
            url: job.applyUrl || job.jobUrl,
            source: "Official career site",
            provider: "Ashby",
            tags: [job.department, job.team].filter(Boolean),
            postedAt: job.publishedAt || null,
        };
    });
};

const getGreenhouseLocations = (job) => {
    const metadataLocations = (job.metadata || [])
        .filter((item) => /location/i.test(item.name || ""))
        .flatMap((item) => flattenValues(item.value));

    return [
        job.location?.name,
        ...metadataLocations,
    ].filter(Boolean);
};

const normalizeGreenhouseJobs = (payload, source) => {
    return (payload.jobs || []).map((job) => {
        const locations = getGreenhouseLocations(job);
        const tags = (job.metadata || [])
            .filter((item) => /department|team|category/i.test(item.name || ""))
            .flatMap((item) => flattenValues(item.value));

        return {
            id: `greenhouse-${source.board}-${job.id}`,
            title: job.title,
            company: source.company,
            location: [...new Set(locations)].join(" · "),
            remote: locations.some((location) => /remote/i.test(location)),
            url: job.absolute_url,
            source: "Official career site",
            provider: "Greenhouse",
            tags,
            postedAt: job.first_published || job.updated_at || null,
        };
    });
};

const normalizeLeverJobs = (payload, source) => {
    return (Array.isArray(payload) ? payload : []).map((job) => {
        const locations = [
            ...(job.categories?.allLocations || []),
            job.categories?.location,
        ].filter(Boolean);

        return {
            id: `lever-${source.board}-${job.id}`,
            title: job.text,
            company: source.company,
            location: [...new Set(locations)].join(" · "),
            remote: locations.some((location) => /remote/i.test(location)),
            url: job.applyUrl || job.hostedUrl,
            source: "Official career site",
            provider: "Lever",
            tags: [
                job.categories?.team,
                job.categories?.department,
                job.categories?.commitment,
            ].filter(Boolean),
            postedAt: job.createdAt
                ? new Date(job.createdAt).toISOString()
                : null,
        };
    });
};

const normalizeGoogleJobs = (html, source) => {
    const $ = cheerio.load(html);
    const jobs = [];
    $('a[href*="jobs/results/"][aria-label^="Learn more about"]').each((_, element) => {
        const link = $(element);
        const card = link.closest(".sMn82b");
        const title = link.attr("aria-label").replace(/^Learn more about\s*/i, "").trim();
        const location = card.find("span.r0wTof").first().text().trim();
        const relativeUrl = link.attr("href");
        const id = (relativeUrl.match(/results\/(\d+)-/) || [])[1] || relativeUrl;
        jobs.push({
            id: `google-${id}`,
            title,
            company: source.company,
            location,
            remote: /remote/i.test(location),
            url: new URL(
                relativeUrl,
                "https://www.google.com/about/careers/applications/"
            ).toString(),
            source: "Official career site",
            provider: "Google Careers",
            tags: ["Software Engineering"],
            postedAt: null,
        });
    });
    return jobs;
};

const normalizeGenericCareerPage = (html, source) => {
    const $ = cheerio.load(html);
    const jobs = [];
    $("a[href]").each((index, element) => {
        const link = $(element);
        const title = link.text().replace(/\s+/g, " ").trim();
        if (!ENGINEERING_PATTERN.test(title) || !SOFTWARE_JOB_PATTERN.test(title)) return;
        const surroundingText = link.closest("li, article, section, div").first().text().replace(/\s+/g, " ");
        const location = (surroundingText.match(/(?:[A-Z][a-z .'-]+,\s*)?(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:,?\s*USA)?/i) || [])[0] || "United States";
        const url = new URL(link.attr("href"), source.careerUrl).toString();
        jobs.push({ id: `generic-${source.company}-${index}`, title, company: source.company, location, remote: /remote/i.test(surroundingText), url, source: "Official career site", provider: "Company career page", tags: [], postedAt: null });
    });
    return jobs;
};

const getSourceUrl = ({ provider, board }) => {
    if (provider === "ashby") {
        return `https://api.ashbyhq.com/posting-api/job-board/${board}`;
    }

    if (provider === "greenhouse") {
        return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
    }

    if (provider === "lever") {
        return `https://api.lever.co/v0/postings/${board}?mode=json`;
    }

    if (provider === "google") {
        return "https://www.google.com/about/careers/applications/jobs/results/?location=United%20States&q=software%20engineer";
    }

    if (provider === "generic") return null;

    throw new Error(`Unsupported career provider: ${provider}`);
};

const normalizeJobs = (payload, source) => {
    if (source.provider === "google") return normalizeGoogleJobs(payload, source);
    if (source.provider === "generic") return normalizeGenericCareerPage(payload, source);
    if (source.provider === "ashby") {
        return normalizeAshbyJobs(payload, source);
    }

    if (source.provider === "greenhouse") {
        return normalizeGreenhouseJobs(payload, source);
    }

    return normalizeLeverJobs(payload, source);
};

const loadCompanyJobs = async (source) => {
    const sourceUrl = getSourceUrl(source);
    const payload = source.provider === "google" || source.provider === "generic"
        ? await fetchHtml(sourceUrl || source.careerUrl)
        : await fetchJson(sourceUrl);

    return normalizeJobs(payload, source)
        .filter((job) => job.url)
        .filter(isSoftwareEngineeringJob);
};

const settleWithConcurrency = async (
    items,
    worker,
    concurrency = 8
) => {
    const results = new Array(items.length);
    let nextIndex = 0;

    const runWorker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;

            try {
                results[index] = {
                    status: "fulfilled",
                    value: await worker(items[index]),
                };
            } catch (error) {
                results[index] = {
                    status: "rejected",
                    reason: error,
                };
            }
        }
    };

    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, items.length) },
            runWorker
        )
    );

    return results;
};

const refreshJobs = async () => {
    const customSources = await listCustomCareerSources();
    const allSources = [
        ...companyCareerSources,
        ...customSources.filter(custom => !companyCareerSources.some(source =>
            source.company.toLowerCase() === custom.company.toLowerCase()
            || (custom.board && source.provider === custom.provider && source.board === custom.board)
        )),
    ];
    const results = await settleWithConcurrency(
        allSources,
        loadCompanyJobs
    );
    const jobs = [];
    const sources = results.map((result, index) => {
        const source = allSources[index];

        if (result.status === "fulfilled") {
            jobs.push(...result.value);
        } else {
            console.error(
                `Failed to load ${source.company} careers:`,
                result.reason.message
            );
        }

        return {
            name: source.company,
            provider: source.provider,
            status:
                result.status === "fulfilled"
                    ? "available"
                    : "unavailable",
        };
    });

    if (!jobs.length && results.every((result) => result.status === "rejected")) {
        throw new Error("All company career sites are currently unavailable.");
    }

    const uniqueJobs = Array.from(
        new Map(jobs.map((job) => [job.url, job])).values()
    ).sort((first, second) => {
        return new Date(second.postedAt || 0) - new Date(first.postedAt || 0);
    });

    cache = {
        jobs: uniqueJobs,
        fetchedAt: Date.now(),
        sources,
    };

    await setCachedJson(REDIS_CACHE_KEY, cache, CACHE_TTL_SECONDS);

    return cache;
};

const getCachedJobs = async () => {
    if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
    const sharedCache = await getCachedJson(REDIS_CACHE_KEY);
    if (!sharedCache?.jobs || !sharedCache?.fetchedAt) return null;
    if (Date.now() - sharedCache.fetchedAt >= CACHE_TTL_MS) return null;
    cache = sharedCache;
    return cache;
};

const getActiveJobPostings = async ({
    query = "software engineer",
    location = "",
    refresh = false,
    page = 1,
    limit = 30,
} = {}) => {
    const current = !refresh
        ? (await getCachedJobs()) || await refreshJobs()
        : await refreshJobs();
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    const useDefaultSoftwareFilter =
        query.trim().toLowerCase() === "software engineer";
    const normalizedLocation = location.trim().toLowerCase();

    const filteredJobs = current.jobs.filter((job) => {
        const searchableText = [
            job.title,
            job.company,
            job.location,
            ...(job.tags || []),
        ].join(" ").toLowerCase();
        const matchesQuery =
            useDefaultSoftwareFilter ||
            !queryTerms.length ||
            queryTerms.every((term) => searchableText.includes(term));
        const matchesLocation =
            !normalizedLocation ||
            job.location.toLowerCase().includes(normalizedLocation) ||
            (normalizedLocation === "remote" && job.remote);

        return matchesQuery && matchesLocation;
    });
    const normalizedPage = Math.max(
        1,
        Number.parseInt(page, 10) || 1
    );
    const normalizedLimit = Math.min(
        100,
        Math.max(1, Number.parseInt(limit, 10) || 30)
    );
    const total = filteredJobs.length;
    const totalPages = Math.ceil(total / normalizedLimit);
    const startIndex = (normalizedPage - 1) * normalizedLimit;
    const jobs = filteredJobs.slice(
        startIndex,
        startIndex + normalizedLimit
    );

    return {
        jobs,
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasMore: startIndex + jobs.length < total,
        fetchedAt: new Date(current.fetchedAt).toISOString(),
        sources: current.sources,
        companiesChecked: current.sources.length,
        companiesAvailable: current.sources.filter(
            (source) => source.status === "available"
        ).length,
    };
};

module.exports = {
    getActiveJobPostings,
    invalidateJobCache,
};
