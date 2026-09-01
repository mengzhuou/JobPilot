import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart as farHeart } from "@fortawesome/free-regular-svg-icons";
import { faBan, faHeart as fasHeart } from "@fortawesome/free-solid-svg-icons";
import { deleteJobPreference, getJobPreferences, setJobPreference } from "../../../connector";
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

    const changeState = async (job, nextState) => {
        await setJobPreference({ state:nextState, jobUrl:job.job_url, jobTitle:job.job_title,
            company:job.company, location:job.location, source:job.source,
            externalJobId:job.external_job_id, employmentType:job.employment_type,
            workplaceType:job.workplace_type, jobPostedAt:job.job_posted_at,
            salary:job.salary, provider:job.provider, tags:job.tags,
            summary:job.summary, requirements:job.requirements });
        if (nextState !== state) setJobs(current => current.filter(item => item.id !== job.id));
    };

    return <main className="management-page"><div className="management-shell">
        <header className="management-heading"><h1>{state === "saved" ? "Saved Jobs" : "Blocked Jobs"}</h1><p>{state === "saved" ? "Roles you want to revisit before applying." : "Jobs hidden from your active listings."}</p></header>
        {error && <p className="management-error">{error}</p>}
        <section className="management-list">{jobs.length ? jobs.map(job =>
            <article className={`management-item${job.current_user_applied ? " management-item-applied" : ""}`} key={job.id}>
                <div className="management-item-copy"><div className="management-item-heading"><h2>{job.job_title || "Job posting"}</h2>{job.current_user_applied && <span className="management-applied-mark">✓ Applied</span>}</div><p>{job.company}{job.location ? ` · ${job.location}` : ""}</p></div>
                <div className="management-actions">
                    {state === "saved" ? <>
                        <button className="preference-icon-action block" type="button" title="Block job" aria-label={`Block ${job.job_title || "job"}`} onClick={() => changeState(job, "blocked")}><FontAwesomeIcon icon={faBan} aria-hidden="true" /></button>
                        <button className="preference-icon-action save active" type="button" title="Remove from saved jobs" aria-label={`Unsave ${job.job_title || "job"}`} onClick={() => remove(job.id)}><FontAwesomeIcon icon={fasHeart} aria-hidden="true" /></button>
                    </> : <>
                        <button className="preference-icon-action block active" type="button" title="Unblock job" aria-label={`Unblock ${job.job_title || "job"}`} onClick={() => remove(job.id)}><FontAwesomeIcon icon={faBan} aria-hidden="true" /></button>
                        <button className="preference-icon-action save" type="button" title="Save job" aria-label={`Save ${job.job_title || "job"}`} onClick={() => changeState(job, "saved")}><FontAwesomeIcon icon={farHeart} aria-hidden="true" /></button>
                    </>}
                    <button className="primary" type="button" onClick={() => autofill(job)} disabled={job.current_user_applied}>{job.current_user_applied ? "Applied" : "Autofill"}
                    </button>
                </div>
            </article>) : <div className="management-panel">No {state} jobs yet.</div>}</section>
    </div></main>;
};

export default JobPreferences;
