import React, { useEffect, useState } from "react";
import { deleteJobPreference, getJobPreferences } from "../../../connector";
import "./ManagementPages.scss";

const matchesConfirmedApplication = (job, confirmation) => (
    Boolean(confirmation?.jobUrl && job.job_url === confirmation.jobUrl) ||
    Boolean(confirmation?.externalJobId && job.external_job_id &&
        String(job.external_job_id) === String(confirmation.externalJobId))
);

const JobPreferences = ({ state }) => {
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        getJobPreferences(state).then(setJobs)
            .catch(requestError => setError(requestError.response?.data?.message || requestError.message));
    }, [state]);

    useEffect(() => {
        const markConfirmedJobApplied = event => {
            if (event.key !== "jobpilot.application.confirmed" || !event.newValue) return;
            try {
                const confirmation = JSON.parse(event.newValue);
                setJobs(current => current.map(job => matchesConfirmedApplication(job, confirmation)
                    ? { ...job, current_user_applied: true }
                    : job));
            } catch {
                // Ignore malformed cross-tab messages.
            }
        };
        window.addEventListener("storage", markConfirmedJobApplied);
        return () => window.removeEventListener("storage", markConfirmedJobApplied);
    }, []);

    const remove = async id => {
        await deleteJobPreference(id);
        setJobs(current => current.filter(job => job.id !== id));
    };

    const autofill = job => {
        if (job.current_user_applied) return;
        const payload = { jobUrl: job.job_url, jobTitle: job.job_title, company: job.company,
            location: job.location, source: job.source, externalJobId: job.external_job_id,
            employmentType: job.employment_type, workplaceType: job.workplace_type,
            jobPostedAt: job.job_posted_at, salary: job.salary, provider: job.provider,
            tags: job.tags, summary: job.summary,
            requirements: job.requirements };
        const key = `jobpilot.autofill.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, JSON.stringify(payload));
        window.open(`/autofill?job=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
        window.setTimeout(() => localStorage.removeItem(key), 60000);
    };

    return <main className="management-page"><div className="management-shell">
        <header className="management-heading"><h1>{state === "saved" ? "Saved Jobs" : "Blocked Jobs"}</h1><p>{state === "saved" ? "Roles you want to revisit before applying." : "Jobs hidden from your active listings."}</p></header>
        {error && <p className="management-error">{error}</p>}
        <section className="management-list">{jobs.length ? jobs.map(job =>
            <article className={`management-item${job.current_user_applied ? " management-item-applied" : ""}`} key={job.id}>
                <div className="management-item-copy"><div className="management-item-heading"><h2>{job.job_title || "Job posting"}</h2>{job.current_user_applied && <span className="management-applied-mark">✓ Applied</span>}</div><p>{job.company}{job.location ? ` · ${job.location}` : ""}</p></div>
                <div className="management-actions"><button className="primary" type="button" onClick={() => autofill(job)} disabled={job.current_user_applied}>{job.current_user_applied ? "Applied" : "Autofill"}</button><a className="management-action-link secondary" href={job.job_url} target="_blank" rel="noreferrer">View job</a><button type="button" onClick={() => remove(job.id)}>{state === "blocked" ? "Unblock" : "Remove"}</button></div>
            </article>) : <div className="management-panel">No {state} jobs yet.</div>}</section>
    </div></main>;
};

export default JobPreferences;
