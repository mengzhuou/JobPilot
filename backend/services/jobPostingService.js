const companyCareerSources = require("./companyCareerSources");

const SOFTWARE_JOB_PATTERN =
    /\b(software|frontend|front-end|backend|back-end|full[ -]?stack|web|mobile|ios|android|java|react|node(?:\.js)?|python|devops|cloud|platform|application|site reliability|data engineer)\b/i;
const ENGINEERING_PATTERN =
    /\b(engineer|engineering|developer|development|programmer|architect)\b/i;
const US_STATE_PATTERN =
    /(?:^|,\s*)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s|,|$)/i;
const US_LOCATION_PATTERN =
    /\b(US|USA|U\.S\.|United States|North America|Worldwide|Anywhere)\b/i;

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = {
    jobs: [],
    fetchedAt: 0,
    sources: [],
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

    throw new Error(`Unsupported career provider: ${provider}`);
};

const normalizeJobs = (payload, source) => {
    if (source.provider === "ashby") {
        return normalizeAshbyJobs(payload, source);
    }

    if (source.provider === "greenhouse") {
        return normalizeGreenhouseJobs(payload, source);
    }

    return normalizeLeverJobs(payload, source);
};

const loadCompanyJobs = async (source) => {
    const payload = await fetchJson(getSourceUrl(source));

    return normalizeJobs(payload, source)
        .filter((job) => job.url)
        .filter(isSoftwareEngineeringJob);
};

const refreshJobs = async () => {
    const results = await Promise.allSettled(
        companyCareerSources.map(loadCompanyJobs)
    );
    const jobs = [];
    const sources = results.map((result, index) => {
        const source = companyCareerSources[index];

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

    return cache;
};

const getActiveJobPostings = async ({
    query = "software engineer",
    location = "",
    refresh = false,
} = {}) => {
    const isCacheFresh = Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    const current = !refresh && isCacheFresh
        ? cache
        : await refreshJobs();
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    const useDefaultSoftwareFilter =
        query.trim().toLowerCase() === "software engineer";
    const normalizedLocation = location.trim().toLowerCase();

    const jobs = current.jobs.filter((job) => {
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

    return {
        jobs,
        total: jobs.length,
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
};
