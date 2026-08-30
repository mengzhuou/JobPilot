import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./FillApplication.css";
import Button from "../../Button/Button";
import {
    confirmJobApplication,
    getApplicationStatus,
    openAndFillApplication,
    stopApplication as stopApplicationAgent,
} from "../../../connector.js";

const FillApplication = () => {
    const routeLocation = useLocation();
    const navigate = useNavigate();
    const job = routeLocation.state || {};
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
            navigate("/active-job-postings", {
                replace: true,
                state: { confirmedJobId: job.externalJobId, confirmedJobUrl: jobUrl },
            });
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
                    <div><span>Career source</span><strong>{job.source || "Official career site"}</strong></div>
                </div>

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
                        <button className="confirm-not-applied" type="button" onClick={() => navigate("/active-job-postings")}>No, I didn&apos;t apply</button>
                    </section>
                </div>
            )}
        </main>
    );
};

export default FillApplication;
