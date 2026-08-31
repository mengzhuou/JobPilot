const companyCareerSources = require("./companyCareerSources");
const cheerio = require("cheerio");
const { randomUUID } = require("crypto");
const { listCustomCareerSources, resolveSource } = require("../repositories/customCareerSourceRepository");
const { getCachedJson, setCachedJson, deleteCachedValue } = require("../config/redis");

const SOFTWARE_JOB_PATTERN =
    /\b(software|frontend|front-end|backend|back-end|full[ -]?stack|web|mobile|ios|android|java|react|node(?:\.js)?|python|devops|cloud|platform|application|site reliability|data engineer|hardware|firmware|embedded|electrical|semiconductor|network|cybersecurity|cyber security|security|architect(?:ure)?)\b/i;
const ENGINEERING_PATTERN =
    /\b(engineer|engineering|developer|development|programmer|architect)\b/i;
const US_STATE_PATTERN =
    /(?:^|,\s*)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s|,|$)/i;
const US_LOCATION_PATTERN =
    /\b(US|USA|U\.S\.|United States|North America|Worldwide|Anywhere)\b/i;

const CACHE_TTL_SECONDS = Number(process.env.JOB_CACHE_TTL_SECONDS) || 10 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const SHARED_CACHE_TTL_SECONDS = Math.max(CACHE_TTL_SECONDS, 24 * 60 * 60);
const REDIS_CACHE_KEY = "jobpilot:active-jobs:v2";
let cache = {
    jobs: [],
    fetchedAt: 0,
    sources: [],
};
let refreshInFlight = null;
let firstBatchInFlight = null;
const sourceDiscoveryTasks = new Map();

const SPECIALIZATION_PATTERNS = {
    embedded: /\b(embedded|firmware|rtos|microcontroller|circuit)\b/i,
    web: /\b(web development|web engineer|front-?end|react|angular|vue|javascript|typescript)\b/i,
    mobile: /\b(mobile|ios|android|iphone|swift|kotlin)\b/i,
};

const EMPLOYMENT_TYPE_PATTERNS = {
    full_time: /\b(full[ -]?time|permanent)\b/i,
    coop: /\b(co[ -]?op|cooperative education)\b/i,
    intern: /\b(intern|internship)\b/i,
};
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasExactKeyword = (text, keyword) => new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(keyword)}(?=$|[^a-z0-9])`, "i"
).test(text);

const getRequiredExperienceYears = text => {
    const values = [];
    const pattern = /\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\+?\s*(?:years?|yrs?)\b/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) values.push(Number(match[1]));
    return values.length ? Math.max(...values) : null;
};

const CITIZENSHIP_OR_CLEARANCE_RESTRICTION = /\b(?:u\.?s\.?\s*citizen(?:ship)?\s*(?:is\s*)?(?:required|only)|citizens?\s+only|must\s+be\s+(?:a\s+)?u\.?s\.?\s*citizen|active\s+(?:security\s+)?clearance|security\s+clearance\s+(?:is\s+)?required|top[- ]secret|ts\/?sci)\b/i;

const cacheJobs = async nextCache => {
    cache = nextCache;
    // Redis retains a stale snapshot longer than the freshness window so a
    // restarted server can respond immediately and refresh it in background.
    await setCachedJson(REDIS_CACHE_KEY, cache, SHARED_CACHE_TTL_SECONDS);
    return cache;
};

const invalidateJobCache = () => {
    cache.fetchedAt = 0;
    void deleteCachedValue(REDIS_CACHE_KEY);
};

const fetchJson = async (url) => {
    let response;
    try {
        response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "JobPilot/1.0 (official career-site index)",
        },
        signal: AbortSignal.timeout(15000),
        });
    } catch (cause) {
        const error = new Error(`Could not reach career source ${new URL(url).hostname}`);
        error.statusCode = 502;
        error.cause = cause;
        throw error;
    }

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
};

const fetchHtml = async url => {
    let response;
    try {
        response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 JobPilot/1.0" },
            signal: AbortSignal.timeout(15000),
        });
    } catch (cause) {
        const error = new Error(`Could not reach ${new URL(url).hostname}`);
        error.statusCode = 502;
        error.cause = cause;
        throw error;
    }
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

const getJobSearchText = job => [
    job.title,
    job.company,
    job.location,
    ...(job.tags || []),
    job.summary,
    ...(job.requirements || []),
].filter(Boolean).join(" ");

const extractJobDetails = html => {
    if (!html) return { summary: "", requirements: [] };
    const $ = cheerio.load(String(html));
    const requirements = $("li").map((_, item) => $(item).text().replace(/\s+/g, " ").trim()).get()
        .filter(text => text.length >= 20 && text.length <= 260).slice(0, 8);
    const summary = $.root().text().replace(/\s+/g, " ").trim().slice(0, 420);
    return { summary, requirements };
};

const normalizeAshbyJobs = (payload, source) => {
    return (payload.jobs || []).map((job) => {
        const details = extractJobDetails(job.descriptionHtml || job.description || job.jobDescription);
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
            ...details,
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
        const details = extractJobDetails(job.content);
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
            ...details,
        };
    });
};

const normalizeLeverJobs = (payload, source) => {
    return (Array.isArray(payload) ? payload : []).map((job) => {
        const detailHtml = [job.description, ...(job.lists || []).map(list => `<h3>${list.text || ""}</h3>${list.content || ""}`)].join(" ");
        const details = extractJobDetails(detailHtml);
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
            ...details,
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
    // Eightfold is frequently hosted on a company's custom careers domain,
    // so hostname detection alone is not sufficient.
    if ($("#smartApplyData").length) return normalizeEightfoldJobs(html, source);
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

const normalizeEightfoldJobs = (html, source) => {
    const $ = cheerio.load(html);
    const serializedData = $("#smartApplyData").text().trim();
    if (!serializedData) return [];

    let payload;
    try {
        payload = JSON.parse(serializedData);
    } catch {
        return [];
    }

    return (payload.positions || []).map(job => ({
        id: `eightfold-${source.board || payload.domain}-${job.id}`,
        title: job.posting_name || job.name,
        company: source.company,
        location: (job.locations || [job.location]).filter(Boolean).join(" · "),
        remote: /remote/i.test(`${job.location || ""} ${job.work_location_option || ""}`),
        url: job.canonicalPositionUrl || new URL(`careers/job/${job.id}`, source.careerUrl).toString(),
        source: "Official career site",
        provider: "Eightfold",
        tags: [job.department, job.business_unit, job.work_location_option].filter(Boolean),
        postedAt: job.t_create ? new Date(job.t_create * 1000).toISOString() : null,
        summary: "",
        requirements: [],
    }));
};

const getSourceUrl = ({ provider, board }) => {
    if (provider === "ashby") {
        return `https://api.ashbyhq.com/posting-api/job-board/${board}`;
    }

    if (provider === "greenhouse") {
        return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
    }

    if (provider === "lever") {
        return `https://api.lever.co/v0/postings/${board}?mode=json`;
    }

    if (provider === "google") {
        return "https://www.google.com/about/careers/applications/jobs/results/?location=United%20States&q=software%20engineer";
    }

    if (provider === "generic") return null;
    if (provider === "eightfold") return null;

    throw new Error(`Unsupported career provider: ${provider}`);
};

const normalizeJobs = (payload, source) => {
    if (source.provider === "google") return normalizeGoogleJobs(payload, source);
    if (source.provider === "generic") return normalizeGenericCareerPage(payload, source);
    if (source.provider === "eightfold") return normalizeEightfoldJobs(payload, source);
    if (source.provider === "ashby") {
        return normalizeAshbyJobs(payload, source);
    }

    if (source.provider === "greenhouse") {
        return normalizeGreenhouseJobs(payload, source);
    }

    if (source.provider === "oracle-uber") {
        return payload.map(job => ({
            id: `uber-${job.Id}`,
            title: job.Title,
            company: "Uber",
            location: job.PrimaryLocation || job.PrimaryLocationCountry || "",
            remote: /remote/i.test(`${job.PrimaryLocation || ""} ${job.WorkplaceType || ""}`),
            url: `https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers/job/${job.Id}`,
            source: "Official career site",
            provider: "Oracle Recruiting",
            tags: [job.JobFamily, job.JobFunction, job.WorkplaceType].filter(Boolean),
            postedAt: job.PostedDate || null,
            summary: job.ShortDescriptionStr || "",
            requirements: [job.ExternalQualificationsStr, job.ExternalResponsibilitiesStr].filter(Boolean),
        }));
    }

    return normalizeLeverJobs(payload, source);
};

const loadCompanyJobs = async (source) => {
    if (source.provider === "oracle-uber") {
        const endpoint = "https://iaziqy.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions";
        const makeUrl = offset => `${endpoint}?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(`findReqs;siteNumber=UberCareers,offset=${offset},limit=200`)}`;
        const firstPayload = await fetchJson(makeUrl(0));
        const firstResult = firstPayload.items?.[0] || {};
        const total = Number(firstResult.TotalJobsCount) || 0;
        const offsets = Array.from({ length: Math.ceil(total / 200) - 1 }, (_, index) => (index + 1) * 200);
        const remainingPayloads = await Promise.all(offsets.map(offset => fetchJson(makeUrl(offset))));
        const requisitions = [firstPayload, ...remainingPayloads].flatMap(payload => payload.items?.[0]?.requisitionList || []);
        return normalizeJobs(requisitions, source).filter(job => job.url).filter(isSoftwareEngineeringJob);
    }
    if (source.provider === "eightfold") {
        const careerUrl = new URL(source.careerUrl);
        careerUrl.searchParams.set("query", "software engineer");
        const html = await fetchHtml(careerUrl.toString());
        return normalizeJobs(html, source)
            .filter(job => job.url)
            .filter(isSoftwareEngineeringJob);
    }
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
    concurrency = 8,
    onSettled = null
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
            onSettled?.(results, index);
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
    const makeSnapshot = (results, refreshing) => {
        const jobs = [];
        const sources = allSources.map((source, index) => {
            const result = results[index];
            if (!result) return { name: source.company, provider: source.provider, status: "loading" };
            if (result.status === "fulfilled") jobs.push(...result.value);
            return {
                name: source.company,
                provider: source.provider,
                status: result.status === "fulfilled" ? "available" : "unavailable",
            };
        });
        const uniqueJobs = Array.from(new Map(jobs.map(job => [job.url, job])).values())
            .sort((first, second) => new Date(second.postedAt || 0) - new Date(first.postedAt || 0));
        return { jobs: uniqueJobs, fetchedAt: Date.now(), sources, refreshing };
    };

    const results = await settleWithConcurrency(allSources, loadCompanyJobs, 8, partialResults => {
        const snapshot = makeSnapshot(partialResults, true);
        cache = snapshot;
        if (snapshot.jobs.length >= 30) firstBatchInFlight?.resolve(snapshot);
    });
    const finalSnapshot = makeSnapshot(results, false);
    firstBatchInFlight?.resolve(finalSnapshot);
    results.forEach((result, index) => {
        const source = allSources[index];
        if (result.status === "rejected") {
            console.error(
                `Failed to load ${source.company} careers:`,
                result.reason.message
            );
        }
    });

    if (!finalSnapshot.jobs.length && results.every((result) => result.status === "rejected")) {
        throw new Error("All company career sites are currently unavailable.");
    }

    return cacheJobs(finalSnapshot);
};

const refreshJobsWithLock = async () => {
    if (refreshInFlight) return refreshInFlight;

    firstBatchInFlight = {};
    firstBatchInFlight.promise = new Promise((resolve, reject) => {
        firstBatchInFlight.resolve = resolve;
        firstBatchInFlight.reject = reject;
    });
    firstBatchInFlight.promise.catch(() => {});
    const batch = firstBatchInFlight;
    refreshInFlight = refreshJobs().catch(error => {
        batch.reject(error);
        throw error;
    }).finally(() => {
        refreshInFlight = null;
        if (firstBatchInFlight === batch) firstBatchInFlight = null;
    });
    return refreshInFlight;
};

const startRefreshAndWaitForFirstBatch = async () => {
    if (!refreshInFlight) void refreshJobsWithLock().catch(() => {});
    return firstBatchInFlight ? firstBatchInFlight.promise : getCachedJobs({ allowStale: true });
};

const getCachedJobs = async ({ allowStale = false } = {}) => {
    if (cache.fetchedAt && (allowStale || Date.now() - cache.fetchedAt < CACHE_TTL_MS)) {
        return cache;
    }

    const sharedCache = await getCachedJson(REDIS_CACHE_KEY);
    if (!sharedCache?.jobs || !sharedCache?.fetchedAt) return null;
    if (!allowStale && Date.now() - sharedCache.fetchedAt >= CACHE_TTL_MS) return null;
    cache = sharedCache;
    return cache;
};

const toCareerSource = source => ({
    ...source,
    careerUrl: source.careerUrl || source.career_url,
});

const inspectCareerSource = async source => {
    const normalizedSource = toCareerSource(source);
    const discoveredJobs = await loadCompanyJobs(normalizedSource);
    if (!discoveredJobs.length) {
        const error = new Error("No matching U.S. software-engineering jobs were found at this career source. The company was not saved.");
        error.statusCode = 422;
        throw error;
    }
    const current = await getCachedJobs({ allowStale: true });
    const existingUrls = new Set((current?.jobs || []).map(job => job.url));
    return {
        source: normalizedSource,
        discoveredJobs,
        jobsFound: discoveredJobs.length,
        newJobsFound: discoveredJobs.filter(job => !existingUrls.has(job.url)).length,
    };
};

const extractSearchResultUrls = html => {
    const $ = cheerio.load(html || "");
    const urls = new Set();
    $("a[href]").each((_, element) => {
        let href = $(element).attr("href") || "";
        if (href.startsWith("/url?")) href = new URL(href, "https://www.google.com").searchParams.get("q") || "";
        try {
            const parsed = new URL(href);
            const duckDuckGoTarget = parsed.searchParams.get("uddg");
            urls.add(duckDuckGoTarget ? decodeURIComponent(duckDuckGoTarget) : parsed.toString());
        } catch {}
    });
    return [...urls];
};

const discoverCareerSource = async companyName => {
    const displayName = companyName.trim().replace(/\b\w/g, character => character.toUpperCase());
    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const slugs = [...new Set([
        normalizedName.replace(/\s+/g, ""),
        normalizedName.replace(/\s+/g, "-"),
    ].filter(Boolean))];
    const guessedSources = slugs.flatMap(board => [
        { company: displayName, provider: "ashby", board, careerUrl: `https://jobs.ashbyhq.com/${board}` },
        { company: displayName, provider: "greenhouse", board, careerUrl: `https://boards.greenhouse.io/${board}` },
        { company: displayName, provider: "lever", board, careerUrl: `https://jobs.lever.co/${board}` },
    ]);
    const guessedInspections = await Promise.allSettled(guessedSources.map(inspectCareerSource));
    const validatedGuess = guessedInspections.find(result => result.status === "fulfilled");
    if (validatedGuess) return validatedGuess.value;

    const query = encodeURIComponent(`${companyName} software engineer careers jobs`);
    const searches = await Promise.allSettled([
        fetchHtml(`https://www.google.com/search?q=${query}`),
        fetchHtml(`https://html.duckduckgo.com/html/?q=${query}`),
    ]);
    const blockedHosts = /(?:linkedin|indeed|glassdoor|ziprecruiter|simplify|builtin|wellfound|monster|google)\./i;
    const candidates = searches.flatMap(result => result.status === "fulfilled" ? extractSearchResultUrls(result.value) : [])
        .filter(url => {
            try {
                const parsed = new URL(url);
                return !blockedHosts.test(parsed.hostname) && (/ashbyhq\.com$|greenhouse\.io$|lever\.co$/i.test(parsed.hostname) || /career|jobs/i.test(parsed.pathname));
            } catch { return false; }
        })
        .sort((left, right) => Number(!/ashbyhq|greenhouse|lever/i.test(left)) - Number(!/ashbyhq|greenhouse|lever/i.test(right)));

    const attempted = new Set();
    for (const candidate of candidates.slice(0, 15)) {
        try {
            const source = resolveSource(candidate);
            const key = `${source.provider}:${source.board || source.careerUrl}`;
            if (attempted.has(key)) continue;
            attempted.add(key);
            source.company = displayName;
            const inspection = await inspectCareerSource(source);
            return inspection;
        } catch {}
    }

    const error = new Error(`JobPilot searched for ${companyName}, but could not validate an official career source containing matching U.S. software-engineering jobs. Try the company's official careers URL.`);
    error.statusCode = 422;
    throw error;
};

const addSourceJobsToCache = async (source, prefetchedJobs = null) => {
    const normalizedSource = toCareerSource(source);
    const discoveredJobs = prefetchedJobs || await loadCompanyJobs(normalizedSource);
    const current = await getCachedJobs({ allowStale: true });

    // The normal first visit still builds the complete catalogue. In the common
    // case, an existing Redis snapshot is updated in-place without re-crawling it.
    if (!current) {
        return {
            jobsFound: discoveredJobs.length,
            newJobsAdded: 0,
            cacheUpdated: false,
            matchingJobUrls: discoveredJobs.map(job => job.url),
        };
    }

    const existingUrls = new Set(current.jobs.map(job => job.url));
    const newJobs = discoveredJobs.filter(job => !existingUrls.has(job.url));
    const nextSources = [
        ...current.sources.filter(item => item.name.toLowerCase() !== normalizedSource.company.toLowerCase()),
        {
            name: normalizedSource.company,
            provider: normalizedSource.provider,
            status: "available",
        },
    ];
    const nextJobs = Array.from(
        new Map([...current.jobs, ...newJobs].map(job => [job.url, job])).values()
    ).sort((first, second) => new Date(second.postedAt || 0) - new Date(first.postedAt || 0));

    await cacheJobs({
        jobs: nextJobs,
        fetchedAt: Date.now(),
        sources: nextSources,
    });

    return {
        jobsFound: discoveredJobs.length,
        newJobsAdded: newJobs.length,
        cacheUpdated: true,
        matchingJobUrls: discoveredJobs.map(job => job.url),
    };
};

const toPublicDiscoveryTask = task => ({
    id: task.id,
    company: task.company,
    status: task.status,
    jobsFound: task.jobsFound,
    newJobsAdded: task.newJobsAdded,
    error: task.error,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
});

const enqueueSourceJobDiscovery = source => {
    const task = {
        id: randomUUID(),
        company: source.company,
        status: "queued",
        jobsFound: null,
        newJobsAdded: null,
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
    sourceDiscoveryTasks.set(task.id, task);

    void Promise.resolve().then(async () => {
        task.status = "processing";
        const discovery = await addSourceJobsToCache(source);

        if (!discovery.cacheUpdated) {
            task.status = "refreshing_catalogue";
            const refreshed = await refreshJobsWithLock();
            const finalUrls = new Set(refreshed.jobs.map(job => job.url));
            discovery.newJobsAdded = discovery.matchingJobUrls
                .filter(url => finalUrls.has(url)).length;
        }

        task.status = "complete";
        task.jobsFound = discovery.jobsFound;
        task.newJobsAdded = discovery.newJobsAdded;
        task.completedAt = new Date().toISOString();
    }).catch(error => {
        task.status = "failed";
        task.error = error.message || "Could not inspect this career site.";
        task.completedAt = new Date().toISOString();
        console.error(`Background source discovery failed for ${task.company}:`, task.error);
    });

    const cleanupTimer = setTimeout(() => sourceDiscoveryTasks.delete(task.id), 60 * 60 * 1000);
    cleanupTimer.unref?.();
    return toPublicDiscoveryTask(task);
};

const getSourceDiscoveryTask = id => {
    const task = sourceDiscoveryTasks.get(id);
    return task ? toPublicDiscoveryTask(task) : null;
};

const getActiveJobPostings = async ({
    query = "software engineer",
    location = "",
    refresh = false,
    page = 1,
    limit = 30,
    company = "",
    excludeCompany = "",
    remoteOnly = false,
    keywords = "",
    specialization = "all",
    eligibility = "all",
    employmentType = "all",
    applicationState = "all",
    appliedJobKeys = new Set(),
    postedWithin = "all",
    locations = "",
    experienceRange = "all",
} = {}) => {
    let current;
    if (refresh) {
        current = await getCachedJobs({ allowStale: true });
        void refreshJobsWithLock().catch(error => {
            console.error("Background job refresh failed:", error.message);
        });
        if (!current) current = await startRefreshAndWaitForFirstBatch();
    } else {
        current = await getCachedJobs({ allowStale: true });
        if (!current) {
            current = await startRefreshAndWaitForFirstBatch();
        } else if (Date.now() - current.fetchedAt >= CACHE_TTL_MS) {
            // Return the existing catalogue immediately after an application;
            // source refreshes should never block the user's trip back to results.
            void refreshJobsWithLock().catch(error => {
                console.error("Background job refresh failed:", error.message);
            });
        }
    }
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    const useDefaultSoftwareFilter =
        query.trim().toLowerCase() === "software engineer";
    const normalizedLocation = location.trim().toLowerCase();
    const normalizedCompany = company.trim().toLowerCase();
    const excludedCompanies = excludeCompany.toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    const requirementTerms = keywords.toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    const specializationPattern = SPECIALIZATION_PATTERNS[specialization] || null;
    const employmentTypePattern = EMPLOYMENT_TYPE_PATTERNS[employmentType] || null;
    const postedWithinMs = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        three_months: 90 * 24 * 60 * 60 * 1000,
        six_months: 180 * 24 * 60 * 60 * 1000,
    }[postedWithin] || null;
    const requestedLocations = locations.toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    const requestedExperience = {
        "0_1": { min: 0, max: 1 },
        "2_3": { min: 2, max: 3 },
        "4_5": { min: 4, max: 5 },
        "6_9": { min: 6, max: 9 },
        "10_plus": { min: 10, max: Infinity },
    }[experienceRange] || null;

    const filteredJobs = current.jobs.filter((job) => {
        const jobText = getJobSearchText(job);
        const searchableText = jobText.toLowerCase();
        const matchesQuery =
            useDefaultSoftwareFilter ||
            !queryTerms.length ||
            queryTerms.every((term) => searchableText.includes(term));
        const matchesLocation =
            !normalizedLocation ||
            job.location.toLowerCase().includes(normalizedLocation) ||
            (normalizedLocation === "remote" && job.remote);

        const matchesCompany = !normalizedCompany || job.company.toLowerCase().includes(normalizedCompany);
        const isExcluded = excludedCompanies.some(excluded => job.company.toLowerCase().includes(excluded));
        const requirementText = [job.summary, ...(job.requirements || [])].join(" ").toLowerCase();
        const matchesRequirements = !requirementTerms.length || requirementTerms.every(term => hasExactKeyword(requirementText, term));
        const matchesRemote = !remoteOnly || job.remote;
        const matchesSpecialization = !specializationPattern || specializationPattern.test(jobText);
        const isRestricted = CITIZENSHIP_OR_CLEARANCE_RESTRICTION.test(jobText);
        const matchesEligibility = eligibility === "permanent_resident_eligible"
            ? !isRestricted
            : eligibility === "citizen_or_clearance_required"
                ? isRestricted
                : true;
        const matchesEmploymentType = !employmentTypePattern || employmentTypePattern.test(jobText);
        const isApplied = appliedJobKeys.has(`url:${job.url}`) || appliedJobKeys.has(`id:${String(job.id || "")}`);
        const matchesApplicationState = applicationState === "applied"
            ? isApplied
            : applicationState === "not_applied" ? !isApplied : true;
        const postedAt = job.postedAt ? new Date(job.postedAt).getTime() : NaN;
        const matchesPostedDate = !postedWithinMs || (Number.isFinite(postedAt) && postedAt >= Date.now() - postedWithinMs);
        const matchesLocations = !requestedLocations.length || requestedLocations.some(requestedLocation =>
            job.location.toLowerCase().includes(requestedLocation) || (requestedLocation === "remote" && job.remote)
        );
        const requiredExperience = getRequiredExperienceYears(jobText);
        const matchesExperience = !requestedExperience || (requiredExperience !== null &&
            requiredExperience >= requestedExperience.min && requiredExperience <= requestedExperience.max);

        return matchesQuery && matchesLocation && matchesCompany && !isExcluded && matchesRequirements && matchesRemote && matchesSpecialization && matchesEligibility && matchesEmploymentType && matchesApplicationState && matchesPostedDate && matchesLocations && matchesExperience;
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
        refreshing: Boolean(refreshInFlight || current.refreshing),
    };
};

module.exports = {
    getActiveJobPostings,
    invalidateJobCache,
    addSourceJobsToCache,
    inspectCareerSource,
    discoverCareerSource,
    enqueueSourceJobDiscovery,
    getSourceDiscoveryTask,
    refreshJobsInBackground: () => {
        void refreshJobsWithLock().catch(error => {
            console.error("Background job cache refresh failed:", error.message);
        });
    },
};
