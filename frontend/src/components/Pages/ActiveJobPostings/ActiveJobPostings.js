import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveJobPostings } from "../../../connector";
import "./ActiveJobPostings.css";

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
    const navigate = useNavigate();
    const [query, setQuery] = useState("software engineer");
    const [location, setLocation] = useState("");
    const [jobs, setJobs] = useState([]);
    const [sources, setSources] = useState([]);
    const [companiesChecked, setCompaniesChecked] = useState(0);
    const [companiesAvailable, setCompaniesAvailable] = useState(0);
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const loadJobs = useCallback(async (forceRefresh = false) => {
        setIsLoading(true);
        setError("");

        try {
            const result = await getActiveJobPostings({
                query,
                location,
                refresh: forceRefresh,
            });

            setJobs(result.jobs || []);
            setSources(result.sources || []);
            setCompaniesChecked(result.companiesChecked || 0);
            setCompaniesAvailable(result.companiesAvailable || 0);
            setFetchedAt(result.fetchedAt || null);
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                requestError.message ||
                "Unable to load active job postings."
            );
        } finally {
            setIsLoading(false);
        }
    }, [location, query]);

    useEffect(() => {
        loadJobs();
        // Load once on entry; searches are submitted explicitly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (event) => {
        event.preventDefault();
        loadJobs();
    };

    const startAutofill = (jobUrl) => {
        navigate("/", {
            state: {
                jobUrl,
            },
        });
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
                    onClick={() => loadJobs(true)}
                    disabled={isLoading}
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

                <button type="submit" disabled={isLoading}>
                    Search jobs
                </button>
            </form>

            <div className="job-results-summary">
                <span>
                    <strong>{jobs.length}</strong>{" "}
                    {jobs.length === 1 ? "posting" : "postings"}
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
            ) : jobs.length === 0 ? (
                <div className="job-results-state">
                    No matching postings were found. Try a broader role or
                    remove the location filter.
                </div>
            ) : (
                <section className="job-card-grid">
                    {jobs.map((job) => (
                        <article className="job-card" key={job.id}>
                            <div className="job-card-source">
                                {job.source}
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
                                    onClick={() => startAutofill(job.url)}
                                >
                                    Autofill
                                </button>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
};

export default ActiveJobPostings;
