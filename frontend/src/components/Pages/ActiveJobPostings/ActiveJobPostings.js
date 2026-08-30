import React, { useCallback, useEffect, useState } from "react";
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
    const [location, setLocation] = useState("");
    const [jobs, setJobs] = useState([]);
    const [sources, setSources] = useState([]);
    const [companiesChecked, setCompaniesChecked] = useState(0);
    const [companiesAvailable, setCompaniesAvailable] = useState(0);
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
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
    const activeAdvancedFilters = [company, excludeCompany, keywords, remoteOnly, specialization !== "all", eligibility !== "all", employmentType !== "all"]
        .filter(Boolean).length;

    const loadJobs = useCallback(async ({
        forceRefresh = false,
        targetPage = 1,
        append = false,
    } = {}) => {
        if (append) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }
        setError("");

        try {
            const result = await getActiveJobPostings({
                query,
                location,
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
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                requestError.message ||
                "Unable to load active job postings."
            );
        } finally {
            if (append) {
                setIsLoadingMore(false);
            } else {
                setIsLoading(false);
            }
        }
    }, [company, displayFilter, eligibility, employmentType, excludeCompany, keywords, location, query, remoteOnly, specialization]);

    useEffect(() => {
        loadJobs({ targetPage: 1 });
        // Searches are submitted explicitly; application-state tabs reload server totals.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayFilter]);

    useEffect(() => {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
            showAdvanced, company, excludeCompany, keywords, remoteOnly,
            specialization, eligibility, employmentType,
        }));
    }, [showAdvanced, company, excludeCompany, keywords, remoteOnly, specialization, eligibility, employmentType]);

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

    const startAutofill = (job) => {
        navigate("/autofill", {
            state: {
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
            },
        });
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
                <label>
                    Role or technology
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Software engineer, React, Java..."
                    />
                </label>

                <label>
                    Location
                    <input
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Dallas, TX or Remote"
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
                    <button className="advanced-filter-toggle" type="button" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Hide filters" : "Show filters"}{activeAdvancedFilters > 0 && <b>{activeAdvancedFilters}</b>}</button>
                </div>
                {showAdvanced && <div className="advanced-filter-panel">
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
                    <label>Work authorization / clearance
                        <select value={eligibility} onChange={event => setEligibility(event.target.value)}>
                            <option value="all">All eligibility requirements</option>
                            <option value="permanent_resident_eligible">Hide citizenship or clearance-restricted jobs</option>
                            <option value="citizen_or_clearance_required">Only citizenship or clearance-restricted jobs</option>
                        </select>
                    </label>
                    <label className="remote-filter"><input type="checkbox" checked={remoteOnly} onChange={event => setRemoteOnly(event.target.checked)} /> Remote jobs only</label>
                    <p className="eligibility-filter-note">Eligibility matching uses explicit citizenship and active-clearance language in the employer&apos;s posting.</p>
                    <div className="advanced-filter-actions"><button className="clear-filters" type="button" onClick={() => { setCompany(""); setExcludeCompany(""); setKeywords(""); setRemoteOnly(false); setSpecialization("all"); setEligibility("all"); setEmploymentType("all"); localStorage.removeItem(FILTER_STORAGE_KEY); }}>Clear</button><button type="button" onClick={() => loadJobs()}>Apply filters</button></div>
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
