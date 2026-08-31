import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation as useRouteLocation, useNavigate } from "react-router-dom";
import { getActiveJobPostings, setJobPreference } from "../../../connector";
import "./ActiveJobPostings.css";

const FILTER_STORAGE_KEY = "jobpilot.activeJobAdvancedFilters.v1";
const getSavedFilters = () => {
    try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)) || {}; }
    catch { return {}; }
};

const formatPostedDate = (date) => {
    if (!date) {
        return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));
};

const ActiveJobPostings = () => {
    const savedFilters = React.useMemo(getSavedFilters, []);
    const navigate = useNavigate();
    const routeLocation = useRouteLocation();
    const [query, setQuery] = useState("software engineer");
    const [jobs, setJobs] = useState([]);
    const [sources, setSources] = useState([]);
    const [companiesChecked, setCompaniesChecked] = useState(0);
    const [companiesAvailable, setCompaniesAvailable] = useState(0);
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState("");
    const [displayFilter, setDisplayFilter] = useState("all");
    const [showAdvanced, setShowAdvanced] = useState(Boolean(savedFilters.showAdvanced));
    const [company, setCompany] = useState(savedFilters.company || "");
    const [excludeCompany, setExcludeCompany] = useState(savedFilters.excludeCompany || "");
    const [keywords, setKeywords] = useState(savedFilters.keywords || "");
    const [remoteOnly, setRemoteOnly] = useState(Boolean(savedFilters.remoteOnly));
    const [specialization, setSpecialization] = useState(savedFilters.specialization || "all");
    const [eligibility, setEligibility] = useState(savedFilters.eligibility || "all");
    const [employmentType, setEmploymentType] = useState(savedFilters.employmentType || "all");
    const [postedWithin, setPostedWithin] = useState(savedFilters.postedWithin || "all");
    const [locations, setLocations] = useState(Array.isArray(savedFilters.locations) ? savedFilters.locations.filter(value => !/remote/i.test(value)) : []);
    const [locationChipInput, setLocationChipInput] = useState("");
    const [experienceRange, setExperienceRange] = useState(savedFilters.experienceRange || "all");
    const [applyClearedFilters, setApplyClearedFilters] = useState(false);
    const activeAdvancedFilters = [company, excludeCompany, keywords, remoteOnly, specialization !== "all", eligibility !== "all", employmentType !== "all", postedWithin !== "all", locations.length > 0, experienceRange !== "all"]
        .filter(Boolean).length;
    const locationSuggestions = useMemo(() => Array.from(new Set([
        ...jobs.flatMap(job => String(job.location || "").split(" · ").map(value => value.trim()).filter(Boolean)),
    ])).filter(value => !/remote/i.test(value) && !locations.includes(value) && value.toLowerCase().includes(locationChipInput.trim().toLowerCase())).slice(0, 8), [jobs, locationChipInput, locations]);

    const loadJobs = useCallback(async ({
        forceRefresh = false,
        targetPage = 1,
        append = false,
        silent = false,
    } = {}) => {
        if (silent) {
            // Keep the first batch visible while the server fills the catalogue.
        } else if (append) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }
        if (!silent) setError("");

        try {
            const result = await getActiveJobPostings({
                query,
                refresh: forceRefresh,
                page: targetPage,
                limit: 30,
                company,
                excludeCompany,
                keywords,
                remoteOnly,
                specialization,
                eligibility,
                employmentType,
                applicationState: displayFilter,
                postedWithin,
                locations,
                experienceRange,
            });

            setJobs((currentJobs) => {
                if (!append) {
                    return result.jobs || [];
                }

                const combinedJobs = [
                    ...currentJobs,
                    ...(result.jobs || []),
                ];

                return Array.from(
                    new Map(
                        combinedJobs.map((job) => [job.id, job])
                    ).values()
                );
            });
            setSources(result.sources || []);
            setCompaniesChecked(result.companiesChecked || 0);
            setCompaniesAvailable(result.companiesAvailable || 0);
            setFetchedAt(result.fetchedAt || null);
            setPage(result.page || targetPage);
            setTotal(result.total || 0);
            setHasMore(Boolean(result.hasMore));
            setIsRefreshing(Boolean(result.refreshing));
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                requestError.message ||
                "Unable to load active job postings."
            );
        } finally {
            if (silent) {
                // No loading-state transition for background catalogue updates.
            } else if (append) {
                setIsLoadingMore(false);
            } else {
                setIsLoading(false);
            }
        }
    }, [company, displayFilter, eligibility, employmentType, excludeCompany, experienceRange, keywords, locations, postedWithin, query, remoteOnly, specialization]);

    useEffect(() => {
        loadJobs({ targetPage: 1 });
        // Searches are submitted explicitly; application-state tabs reload server totals.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayFilter]);

    useEffect(() => {
        if (!isRefreshing) return undefined;
        const timer = window.setTimeout(() => {
            loadJobs({ targetPage: 1, silent: true });
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [isRefreshing, loadJobs]);

    useEffect(() => {
        if (!applyClearedFilters) return;
        setApplyClearedFilters(false);
        loadJobs({ targetPage: 1 });
    }, [applyClearedFilters, loadJobs]);

    const clearAdvancedFilters = () => {
        setCompany("");
        setExcludeCompany("");
        setKeywords("");
        setRemoteOnly(false);
        setSpecialization("all");
        setEligibility("all");
        setEmploymentType("all");
        setPostedWithin("all");
        setLocations([]);
        setLocationChipInput("");
        setExperienceRange("all");
        localStorage.removeItem(FILTER_STORAGE_KEY);
        setApplyClearedFilters(true);
    };

    useEffect(() => {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
            showAdvanced, company, excludeCompany, keywords, remoteOnly,
            specialization, eligibility, employmentType,
            postedWithin,
            locations, experienceRange,
        }));
    }, [showAdvanced, company, excludeCompany, keywords, remoteOnly, specialization, eligibility, employmentType, postedWithin, locations, experienceRange]);

    useEffect(() => {
        if (!routeLocation.state?.confirmedJobUrl) return undefined;
        const timer = window.setTimeout(() => {
            navigate(routeLocation.pathname, { replace: true, state: null });
        }, 3000);
        return () => window.clearTimeout(timer);
    }, [navigate, routeLocation.pathname, routeLocation.state]);

    const visibleJobs = jobs.filter(job => {
        if (job.currentUserBlocked) return false;
        return true;
    });

    const handleSearch = (event) => {
        event.preventDefault();
        loadJobs();
    };

    const addLocationChip = value => {
        const matchedLocation = locationSuggestions.find(item => item.toLowerCase() === value.trim().toLowerCase());
        if (matchedLocation) {
            setLocations(current => [...current, matchedLocation]);
        }
        setLocationChipInput("");
    };

    const startAutofill = (job) => {
        const autofillJob = {
                jobUrl: job.url,
                jobTitle: job.title,
                company: job.company,
                location: job.location,
                source: job.source,
                externalJobId: job.id,
                employmentType: job.employmentType,
                workplaceType: job.workplaceType,
                jobPostedAt: job.postedAt,
                summary: job.summary,
                requirements: job.requirements,
        };
        const storageKey = `jobpilot.autofill.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(storageKey, JSON.stringify(autofillJob));
        window.open(`/autofill?job=${encodeURIComponent(storageKey)}`, "_blank", "noopener,noreferrer");
        window.setTimeout(() => localStorage.removeItem(storageKey), 60_000);
    };

    const updatePreference = async (job, state) => {
        try {
            await setJobPreference({ state, jobUrl:job.url, jobTitle:job.title,
                company:job.company, location:job.location, source:job.source,
                externalJobId:job.id });
            setJobs(current => current.map(item => item.id === job.id
                ? { ...item, currentUserSaved:state === "saved", currentUserBlocked:state === "blocked" }
                : item));
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to update this job.");
        }
    };

    return (
        <main className="active-jobs-page">
            <section className="active-jobs-header">
                <div>
                    <span className="active-jobs-eyebrow">
                        Job discovery
                    </span>
                    <h1>Active Job Postings</h1>
                    <p>
                        Browse software engineering roles explicitly
                        available to candidates in the United States.
                    </p>
                </div>

                <button
                    className="refresh-jobs-button"
                    type="button"
                    onClick={() => loadJobs({ forceRefresh: true })}
                    disabled={isLoading || isLoadingMore}
                >
                    {isLoading ? "Refreshing..." : "Refresh sources"}
                </button>
            </section>

            <form className="job-search-panel" onSubmit={handleSearch}>
                <label className="simple-keyword-search">
                    Role or technology
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Software engineer, React, Java..."
                    />
                </label>

                <button
                    type="submit"
                    disabled={isLoading || isLoadingMore}
                >
                    Search jobs
                </button>
            </form>

            <section className="advanced-filter-shell" aria-label="Advanced job filters">
                <div className="advanced-filter-heading">
                    <div><span>Refine results</span><strong>Advanced filters</strong></div>
                    <div className="advanced-filter-heading-actions">
                        {activeAdvancedFilters > 0 && <button className="clear-filters" type="button" onClick={clearAdvancedFilters}>Clear filters</button>}
                        <button className="advanced-filter-toggle" type="button" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Hide filters" : "Show filters"}{activeAdvancedFilters > 0 && <b>{activeAdvancedFilters}</b>}</button>
                    </div>
                </div>
                {showAdvanced && <div className="advanced-filter-panel">
                    <label className="advanced-filter-wide">Available Locations
                        <div className="location-autocomplete">
                            <div className="location-chip-input">
                                {locations.map(item => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setLocations(current => current.filter(locationItem => locationItem !== item))}>×</button></span>)}
                                <input value={locationChipInput} onChange={event => setLocationChipInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && locationSuggestions[0]) { event.preventDefault(); addLocationChip(locationSuggestions[0]); } }} placeholder="Start typing a city, state" role="combobox" aria-controls="location-filter-suggestions" aria-expanded={Boolean(locationChipInput && locationSuggestions.length)} />
                            </div>
                            {locationChipInput && locationSuggestions.length > 0 && <div className="location-suggestions" id="location-filter-suggestions" role="listbox">{locationSuggestions.map(item => <button type="button" role="option" aria-selected="false" key={item} onMouseDown={event => event.preventDefault()} onClick={() => addLocationChip(item)}>{item}</button>)}</div>}
                            <br/>
                            <label className="remote-filter"><input type="checkbox" lassName="remote-filter" checked={remoteOnly} onChange={event => setRemoteOnly(event.target.checked)} /> Remote jobs only</label>
                        </div>
                    </label>
                    <label>Company<input value={company} onChange={event => setCompany(event.target.value)} placeholder="e.g. Google or Stripe" /></label>
                    <label>Exclude companies<input value={excludeCompany} onChange={event => setExcludeCompany(event.target.value)} placeholder="e.g. Amazon, Meta" /></label>
                    <label>Required skills / keywords<input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. React, Java, Kubernetes" /></label>
                    <label>Engineering focus
                        <select value={specialization} onChange={event => setSpecialization(event.target.value)}>
                            <option value="all">All</option>
                            <option value="embedded">Embedded / firmware</option>
                            <option value="web">Web development</option>
                            <option value="mobile">iOS / Android / mobile</option>
                        </select>
                    </label>
                    <label>Job type
                        <select value={employmentType} onChange={event => setEmploymentType(event.target.value)}>
                            <option value="all">All job types</option>
                            <option value="full_time">Full-time</option>
                            <option value="coop">Co-op</option>
                            <option value="intern">Intern</option>
                        </select>
                    </label>
                    <label>Date posted
                        <select value={postedWithin} onChange={event => setPostedWithin(event.target.value)}>
                            <option value="all">Any posting date</option>
                            <option value="day">New in the last 24 hours</option>
                            <option value="week">Posted within 1 week</option>
                            <option value="month">Posted within 1 month</option>
                            <option value="three_months">Posted within 3 months</option>
                            <option value="six_months">Posted within 6 months</option>
                        </select>
                    </label>
                    <label>Experience level
                        <select value={experienceRange} onChange={event => setExperienceRange(event.target.value)}>
                            <option value="all">Any experience level</option><option value="0_1">0–1 years</option><option value="2_3">2–3 years</option><option value="4_5">4–5 years</option><option value="6_9">6–9 years</option><option value="10_plus">10+ years</option>
                        </select>
                    </label>
                    <label>Work authorization / clearance
                        <select value={eligibility} onChange={event => setEligibility(event.target.value)}>
                            <option value="all">All eligibility requirements</option>
                            <option value="permanent_resident_eligible">Hide citizenship or clearance-restricted jobs</option>
                            <option value="citizen_or_clearance_required">Only citizenship or clearance-restricted jobs</option>
                        </select>
                    </label>
                    <div className="advanced-filter-actions"><button type="button" onClick={() => loadJobs()}>Apply filters</button></div>
                </div>}
            </section>

            {routeLocation.state?.confirmedJobUrl && (
                <div className="application-saved-banner" role="status">
                    Application saved. This job is now marked as applied.
                </div>
            )}

            <div className="job-display-filters" aria-label="Filter jobs by application state">
                {[
                    ["all", "All jobs"],
                    ["not_applied", "Not yet applied"],
                    ["applied", "Applied"],
                ].map(([value, label]) => (
                    <button key={value} type="button" className={displayFilter === value ? "active" : ""} onClick={() => setDisplayFilter(value)}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="job-results-summary">
                <span>
                    <strong>{total}</strong>{" "}
                    {total === 1 ? "posting" : "postings"}
                    {total > jobs.length && (
                        <> · showing {jobs.length}</>
                    )}
                </span>
                <span>
                    Company sites:{" "}
                    {companiesAvailable || sources.filter(
                        (source) => source.status === "available"
                    ).length}
                    /{companiesChecked || sources.length} available
                    {isRefreshing && " · updating…"}
                </span>
                {fetchedAt && (
                    <span>
                        Updated {new Date(fetchedAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                    </span>
                )}
            </div>

            {error && <div className="job-results-error">{error}</div>}

            {isLoading ? (
                <div className="job-results-state">Loading active jobs...</div>
            ) : visibleJobs.length === 0 ? (
                <div className="job-results-state">
                    No jobs match this display filter.
                </div>
            ) : (
                <>
                    <section className="job-card-grid">
                        {visibleJobs.map((job) => (
                            <article className={`job-card${job.currentUserApplied ? " job-card-applied" : ""}`} key={job.id}>
                                <div className="job-card-labels">
                                    <div className="job-card-source">{job.source}</div>
                                    {job.currentUserApplied && <span className="applied-mark">✓ Applied</span>}
                                </div>
                                <h2>{job.title}</h2>
                                <p className="job-card-company">{job.company}</p>
                                <div className="job-card-meta">
                                    <span>{job.location}</span>
                                    <span>{formatPostedDate(job.postedAt)}</span>
                                </div>
                                <div className="job-card-tags">
                                    {(job.tags || []).slice(0, 4).map((tag) => (
                                        <span key={tag}>{tag}</span>
                                    ))}
                                </div>
                                {job.applicantCount > 0 && (
                                    <p className="jobpilot-applicant-count">
                                        {job.applicantCount} JobPilot {job.applicantCount === 1 ? "user has" : "users have"} marked this job applied
                                    </p>
                                )}
                                <div className="job-card-actions">
                                    <a
                                        href={job.url}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View job
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => startAutofill(job)}
                                        disabled={job.currentUserApplied}
                                    >
                                        {job.currentUserApplied ? "Applied" : "Autofill"}
                                    </button>
                                </div>
                                <div className="job-card-secondary-actions">
                                    <button type="button" onClick={() => updatePreference(job, "saved")}>{job.currentUserSaved ? "★ Saved" : "☆ Save"}</button>
                                    <button type="button" onClick={() => updatePreference(job, "blocked")}>Block</button>
                                </div>
                            </article>
                        ))}
                    </section>

                    {hasMore && (
                        <div className="load-more-jobs">
                            <button
                                type="button"
                                onClick={() => loadJobs({
                                    targetPage: page + 1,
                                    append: true,
                                })}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore
                                    ? "Loading more..."
                                    : "Load 30 more jobs"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </main>
    );
};

export default ActiveJobPostings;
