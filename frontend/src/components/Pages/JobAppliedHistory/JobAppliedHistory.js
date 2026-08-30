import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    deleteJobApplication,
    getJobApplicationHistory,
    getJobApplicationSummary,
    updateJobApplication,
} from "../../../connector";
import "./JobAppliedHistory.css";

const STATUS_OPTIONS = [
    { value: "applied", label: "Applied" },
    { value: "interviewing", label: "Interviewing" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "no_response", label: "No response" },
    { value: "withdrawn", label: "Withdrawn" },
];

const EMPTY_SUMMARY = {
    total: 0,
    applied: 0,
    interviewing: 0,
    accepted: 0,
    rejected: 0,
    no_response: 0,
    withdrawn: 0,
};

const formatDate = date => new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
}).format(new Date(date));

const JobAppliedHistory = () => {
    const [applications, setApplications] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [status, setStatus] = useState("");
    const [dateRange, setDateRange] = useState("all");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [notes, setNotes] = useState({});
    const [savingId, setSavingId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const loadHistory = useCallback(async () => {
        setIsLoading(true);
        setError("");

        try {
            const [history, totals] = await Promise.all([
                getJobApplicationHistory({ status, search, page, limit: 12, dateRange }),
                getJobApplicationSummary(),
            ]);

            setApplications(history.applications || []);
            setTotalPages(history.totalPages || 1);
            setTotal(history.total || 0);
            setSummary({ ...EMPTY_SUMMARY, ...totals });
            setNotes(current => {
                const next = { ...current };
                (history.applications || []).forEach(application => {
                    if (!(application.id in next)) {
                        next[application.id] = application.notes || "";
                    }
                });
                return next;
            });
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                requestError.message ||
                "Unable to load application history."
            );
        } finally {
            setIsLoading(false);
        }
    }, [dateRange, page, search, status]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const outcomeSegments = useMemo(() => STATUS_OPTIONS
        .map(option => ({
            ...option,
            count: Number(summary[option.value]) || 0,
        }))
        .filter(segment => segment.count > 0), [summary]);

    const outcomeRate = summary.total
        ? Math.round((summary.accepted / summary.total) * 100)
        : 0;

    const submitSearch = event => {
        event.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    };

    const saveApplication = async (application, nextStatus = application.status) => {
        setSavingId(application.id);
        setError("");

        try {
            await updateJobApplication(application.id, {
                status: nextStatus,
                notes: notes[application.id] || "",
            });
            await loadHistory();
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                "Unable to update this application."
            );
        } finally {
            setSavingId(null);
        }
    };

    const removeApplication = async application => {
        if (!window.confirm(`Delete ${application.job_title || "this application"} from your history?`)) return;
        setSavingId(application.id);
        setError("");
        try {
            await deleteJobApplication(application.id);
            await loadHistory();
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to delete this application.");
        } finally {
            setSavingId(null);
        }
    };

    return (
        <main className="history-page">
            <section className="history-heading">
                <div>
                    <span className="history-eyebrow">Application tracker</span>
                    <h1>Job Applied History</h1>
                    <p>Track every confirmed submission and keep outcomes current.</p>
                </div>
                <div className="history-rate">
                    <strong>{outcomeRate}%</strong>
                    <span>acceptance rate</span>
                </div>
            </section>

            <section className="history-summary" aria-label="Application summary">
                <article><span>Total applications</span><strong>{summary.total}</strong></article>
                <article><span>Interviewing</span><strong>{summary.interviewing}</strong></article>
                <article className="accepted"><span>Accepted</span><strong>{summary.accepted}</strong></article>
                <article className="rejected"><span>Rejected</span><strong>{summary.rejected}</strong></article>
                <article className="waiting"><span>No response</span><strong>{summary.no_response}</strong></article>
            </section>

            <section className="outcome-panel">
                <div className="outcome-copy">
                    <div>
                        <h2>Outcome snapshot</h2>
                        <p>Status distribution across all your applications.</p>
                    </div>
                    <span>{summary.total} tracked</span>
                </div>
                <div className="outcome-bar" aria-label="Application status distribution">
                    {outcomeSegments.length ? outcomeSegments.map(segment => (
                        <div
                            key={segment.value}
                            className={`outcome-segment status-${segment.value}`}
                            style={{ width: `${(segment.count / summary.total) * 100}%` }}
                            title={`${segment.label}: ${segment.count}`}
                        />
                    )) : <div className="outcome-empty" />}
                </div>
                <div className="outcome-legend">
                    {STATUS_OPTIONS.map(option => (
                        <span key={option.value}>
                            <i className={`status-${option.value}`} />
                            {option.label} <strong>{summary[option.value]}</strong>
                        </span>
                    ))}
                </div>
            </section>

            <section className="history-controls">
                <form onSubmit={submitSearch}>
                    <input
                        value={searchInput}
                        onChange={event => setSearchInput(event.target.value)}
                        placeholder="Search company, role, or location"
                        aria-label="Search application history"
                    />
                    <button type="submit">Search</button>
                </form>
                <select
                    value={status}
                    onChange={event => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                    aria-label="Filter by status"
                >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                <select value={dateRange} onChange={event => { setDateRange(event.target.value); setPage(1); }} aria-label="Filter by application date">
                    <option value="all">Any application date</option>
                    <option value="today">Applied today</option>
                    <option value="week">Within 1 week</option>
                    <option value="month">Within 1 month</option>
                    <option value="three_months">Within 3 months</option>
                    <option value="year">Within 1 year</option>
                </select>
            </section>

            <div className="history-result-count">
                {total} {total === 1 ? "application" : "applications"}
            </div>

            {error && <div className="history-error" role="alert">{error}</div>}

            {isLoading ? (
                <div className="history-state">Loading your application history…</div>
            ) : applications.length === 0 ? (
                <div className="history-state history-empty">
                    <div className="history-empty-icon">✓</div>
                    <h2>No applications here yet</h2>
                    <p>Confirmed autofill submissions will automatically appear on this page.</p>
                </div>
            ) : (
                <section className="history-list">
                    {applications.map(application => (
                        <article className="history-card" key={application.id}>
                            <div className="history-card-main">
                                <div className="history-card-topline">
                                    <span className={`history-status status-${application.status}`}>
                                        {STATUS_OPTIONS.find(item => item.value === application.status)?.label}
                                    </span>
                                    <span>Applied {formatDate(application.applied_at)}</span>
                                </div>
                                <h2>{application.job_title || "Software engineering position"}</h2>
                                <p className="history-company">{application.company || "Company unavailable"}</p>
                                <div className="history-meta">
                                    {application.location && <span>{application.location}</span>}
                                    {application.source && <span>{application.source}</span>}
                                </div>
                                <a href={application.job_url} target="_blank" rel="noreferrer">View original posting ↗</a>
                            </div>

                            <div className="history-card-edit">
                                <label>
                                    Current status
                                    <select
                                        value={application.status}
                                        onChange={event => saveApplication(application, event.target.value)}
                                        disabled={savingId === application.id}
                                    >
                                        {STATUS_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Notes
                                    <textarea
                                        value={notes[application.id] || ""}
                                        onChange={event => setNotes(current => ({
                                            ...current,
                                            [application.id]: event.target.value,
                                        }))}
                                        placeholder="Recruiter name, interview date, follow-up…"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => saveApplication(application)}
                                    disabled={savingId === application.id}
                                >
                                    {savingId === application.id ? "Saving…" : "Save notes"}
                                </button>
                                <button
                                    className="delete-application-button"
                                    type="button"
                                    onClick={() => removeApplication(application)}
                                    disabled={savingId === application.id}
                                >
                                    Delete record
                                </button>
                            </div>
                        </article>
                    ))}
                </section>
            )}

            {totalPages > 1 && (
                <nav className="history-pagination" aria-label="Application history pages">
                    <button disabled={page === 1 || isLoading} onClick={() => setPage(page - 1)}>Previous</button>
                    <span>Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages || isLoading} onClick={() => setPage(page + 1)}>Next</button>
                </nav>
            )}
        </main>
    );
};

export default JobAppliedHistory;
