import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "./FillApplication.scss";
import Button from "../../Button/Button";
import {
    confirmJobApplication,
    getApplicationStatus,
    openAndFillApplication,
    stopApplication as stopApplicationAgent,
} from "../../../connector.js";

const formatJobDate = value => {
    if (!value) return "Not provided";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? String(value)
        : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

const FillApplication = () => {
    const routeLocation = useLocation();
    const job = React.useMemo(() => {
        if (routeLocation.state) return routeLocation.state;
        const storageKey = new URLSearchParams(routeLocation.search).get("job");
        if (!storageKey) return {};
        try {
            return JSON.parse(localStorage.getItem(storageKey)) || {};
        }
        catch { return {}; }
    }, [routeLocation.search, routeLocation.state]);
    const [jobUrl, setJobUrl] = useState(job.jobUrl || "");
    const [status, setStatus] = useState("idle");
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState("");
    const wasRunning = useRef(false);
    const isStarting = status === "starting";
    const isRunning = status === "running";

    useEffect(() => {
        const syncStatus = async () => {
            try {
                const result = await getApplicationStatus();
                if (wasRunning.current && !result.running) setShowConfirmation(true);
                wasRunning.current = result.running;
                setStatus(current => current === "idle" && !result.running
                    ? current
                    : result.status);
            } catch (requestError) {
                console.error("Failed to fetch application status:", requestError);
            }
        };
        const statusTimer = setInterval(syncStatus, 1000);
        return () => clearInterval(statusTimer);
    }, []);

    const applicationPayload = {
        jobUrl,
        jobTitle: job.jobTitle,
        company: job.company,
        location: job.location,
        source: job.source,
        externalJobId: job.externalJobId,
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
        jobPostedAt: job.jobPostedAt,
        salary: job.salary,
        summary: job.summary,
        requirements: job.requirements,
    };

    const startApplication = async () => {
        if (!jobUrl.trim()) return;
        setError("");
        setStatus("starting");
        try {
            await openAndFillApplication(applicationPayload);
            wasRunning.current = true;
            setStatus("running");
        } catch (requestError) {
            setStatus("error");
            setError(requestError.response?.data?.message
                || requestError.message
                || "Failed to start Playwright.");
        }
    };

    const stopApplication = async () => {
        try {
            await stopApplicationAgent();
            wasRunning.current = false;
            setStatus("stopped");
            setShowConfirmation(true);
        } catch (requestError) {
            setStatus("error");
            setError(requestError.message || "Failed to stop Playwright.");
        }
    };

    const confirmApplied = async () => {
        setIsConfirming(true);
        setError("");
        try {
            await confirmJobApplication(applicationPayload);
            localStorage.setItem("jobpilot.application.confirmed", JSON.stringify({
                externalJobId: job.externalJobId,
                jobUrl,
                confirmedAt: Date.now(),
            }));
            setShowConfirmation(false);
            setStatus("applied");
            setIsConfirming(false);
            window.setTimeout(() => window.close(), 50);
        } catch (requestError) {
            setError(requestError.response?.data?.message
                || "Unable to save this application.");
            setIsConfirming(false);
        }
    };

    return (
        <main className="autofill-page">
            <section className="autofill-card">
                <div className="autofill-heading">
                    <div>
                        <span className="autofill-eyebrow">Application assistant</span>
                        <h1>{job.jobTitle || "Autofill an application"}</h1>
                        <p className="autofill-company">{job.company || "Job application"}</p>
                    </div>
                    <span className={`autofill-status status-${status}`}>{status}</span>
                </div>

                <div className="job-detail-grid">
                    <div><span>Location</span><strong>{job.location || "Not provided"}</strong></div>
                    <div><span>Workplace</span><strong>{job.workplaceType || "Not provided"}</strong></div>
                    <div><span>Employment</span><strong>{job.employmentType || "Not provided"}</strong></div>
                    <div><span>Salary</span><strong>{job.salary || "Not listed"}</strong></div>
                    <div><span>Date posted</span><strong>{formatJobDate(job.jobPostedAt)}</strong></div>
                    <div><span>Career source</span><strong>{job.source || "Official career site"}</strong></div>
                </div>

                {(job.provider || job.tags?.length > 0) && <div className="autofill-job-tags" aria-label="Job details">
                    {job.provider && <span>{job.provider}</span>}
                    {(job.tags || []).slice(0, 5).map(tag => <span key={tag}>{tag}</span>)}
                </div>}

                {(job.summary || job.requirements?.length > 0) && <section className="job-requirements-panel">
                    <h2>What this role is looking for</h2>
                    {job.summary && <p>{job.summary}</p>}
                    {job.requirements?.length > 0 && <ul>{job.requirements.slice(0, 8).map((requirement, index) => <li key={`${requirement}-${index}`}>{requirement}</li>)}</ul>}
                </section>}

                <label className="application-url-label">
                    Application URL
                    <div className="job-url-section">
                        <input type="url" value={jobUrl} onChange={event => setJobUrl(event.target.value)} disabled={isStarting || isRunning} />
                        {isStarting ? <Button disabled>Starting…</Button>
                            : isRunning ? <Button onClick={stopApplication}>Finish</Button>
                                : <Button onClick={startApplication}>Start Autofill</Button>}
                    </div>
                </label>

                {error && <div className="autofill-error" role="alert">{error}</div>}

                <section className="autofill-progress" aria-label="Autofill workflow">
                    <h2>What happens next</h2>
                    <ol>
                        <li className={status !== "idle" ? "complete" : ""}>JobPilot opens the official application in a controlled browser.</li>
                        <li className={isRunning ? "active" : ""}>Review the filled fields and complete any verification manually.</li>
                        <li>Return here and confirm whether you submitted the application.</li>
                    </ol>
                    {isRunning && <button className="finished-link" type="button" onClick={() => setShowConfirmation(true)}>I finished applying</button>}
                </section>
            </section>

            {showConfirmation && (
                <div className="confirmation-backdrop">
                    <section className="application-confirmation" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
                        <button className="confirmation-close" type="button" onClick={() => setShowConfirmation(false)} aria-label="Close">×</button>
                        <div className="confirmation-icon">✓</div>
                        <h2 id="confirmation-title">Did you apply?</h2>
                        <p>Let us know so JobPilot can track your application and keep your job list current.</p>
                        <button className="confirm-applied" type="button" onClick={confirmApplied} disabled={isConfirming}>{isConfirming ? "Saving…" : "Yes, I applied!"}</button>
                        <button className="confirm-not-applied" type="button" onClick={() => setShowConfirmation(false)}>No, I didn&apos;t apply</button>
                    </section>
                </div>
            )}
        </main>
    );
};

export default FillApplication;
