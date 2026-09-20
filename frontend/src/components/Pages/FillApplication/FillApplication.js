import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faBuilding, faCircleCheck, faCircleInfo, faClock, faListCheck, faLocationDot, faMoneyBillWave, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import "./FillApplication.scss";
import Button from "../../Button/Button";
import useExtensionApplication from "./useExtensionApplication";
import {
    reportJob,
    getJobReportStatus,
    getJobPosting,
    getUserProfile,
    updateUserProfileSection,
} from "../../../connector.js";

const REPORT_REASONS = [
    "website has bot protection that blocks submission",
    "website is invalid or job no longer exists",
    "It's a scam",
    "Other",
];
const MAX_INPUT_LENGTH = 199;
const uniqueTags = tags => [...new Map((tags || []).filter(Boolean).map(tag => [String(tag).trim().toLocaleLowerCase(), String(tag).trim()])).values()];
const normalizedSkill = skill => String(skill || "").toLocaleLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
const SKILL_EQUIVALENTS = new Map([
    ["ai", "artificial intelligence"],
    ["gcp", "google cloud platform"],
    ["azure", "microsoft azure"],
    ["vue", "vue.js"],
    ["vue js", "vue.js"],
]);
const canonicalSkill = skill => {
    const normalized = normalizedSkill(skill);
    return SKILL_EQUIVALENTS.get(normalized) || normalized;
};
const equivalentSkill = (left, right) => {
    const first = canonicalSkill(left);
    const second = canonicalSkill(right);
    return first === second || (first.length > 2 && second.length > 2 && (first.includes(second) || second.includes(first)));
};
const companyInitials = company => String(company || "Job").split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const companyLogo = job => {
    if (job.companyLogo || job.logoUrl) return job.companyLogo || job.logoUrl;
    const genericHosts = /(?:ashbyhq|greenhouse|lever|workday|oraclecloud|smartrecruiters|jobvite)\./i;
    let domain = "";
    try {
        const host = new URL(job.jobUrl || job.url || "").hostname.replace(/^www\./, "");
        if (!genericHosts.test(host)) domain = host;
    } catch { /* Fall back to the company-name domain. */ }
    if (!domain) {
        const brand = String(job.company || "").toLowerCase()
            .replace(/\b(?:incorporated|corporation|company|technologies|technology|holdings|inc|corp|llc|ltd)\b/g, "")
            .replace(/[^a-z0-9]+/g, "");
        if (brand) domain = `${brand}.com`;
    }
    return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : "";
};
const companyHue = company => [...String(company || "")].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;

const displayValue = value => value || "N/A";
const formatCompensation = value => {
    const salary = String(value || "").trim();
    if (!salary || /\b(?:million|billion|funding|valuation)\b/i.test(salary)) return "N/A";
    const hasPeriod = /(?:\/|per\s+)(?:hour|hr|year|yr)|\b(?:hourly|annual|annually)\b/i.test(salary);
    const hasThousandsMarker = /\d\s*[kK]\b/.test(salary) || /\d{1,3},\d{3}/.test(salary);
    return hasPeriod || hasThousandsMarker ? salary : "N/A";
};
const cleanSummary = value => {
    let summary = String(value || "")
        .replace(/<\/?[a-z][^>]*>/gi, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#(?:39|x27);/gi, "'")
        .replace(/\s+/g, " ").trim()
        .replace(/([.!?])(?=[A-Z])/g, "$1 ")
        .replace(/^About\s+/i, "")
        .replace(/^([A-Za-z][A-Za-z0-9&.'-]{2,35})\1\b/i, "$1");
    if (!/[.!?]$/.test(summary)) {
        const lastSentence = Math.max(summary.lastIndexOf("."), summary.lastIndexOf("!"), summary.lastIndexOf("?"));
        if (lastSentence >= 100) summary = summary.slice(0, lastSentence + 1);
    }
    return summary;
};
const splitRequirements = requirements => {
    const qualificationPattern = /\b(required|qualification|must|minimum|degree|bachelor|master|ph\.?d|graduat(?:e|ing|ion)|class of|new grad|years? (?:of )?experience|experience with|proficien|knowledge|skill|ability|eligible|gpa|authorization|authorized)\b/i;
    const rows = (requirements || []).filter(Boolean);
    const qualifications = rows.filter(row => qualificationPattern.test(row));
    const responsibilities = rows.filter(row => !qualificationPattern.test(row));
    return {
        qualifications: qualifications.length ? qualifications : rows,
        responsibilities: responsibilities.length ? responsibilities : [],
    };
};

const FillApplication = () => {
    const isAdmin = useSelector(state => state.studentData?.role === "admin");
    const routeLocation = useLocation();
    const jobId = new URLSearchParams(routeLocation.search).get("jobId");
    const [job, setJob] = useState(() => {
        if (routeLocation.state) return routeLocation.state;
        const legacyStorageKey = new URLSearchParams(routeLocation.search).get("job");
        const storageKey = jobId ? `jobpilot.autofill.${jobId}` : legacyStorageKey;
        if (!storageKey) return {};
        try {
            return JSON.parse(localStorage.getItem(storageKey)) || {};
        }
        catch { return {}; }
    });
    const [jobUrl, setJobUrl] = useState(job.jobUrl || "");
    const [error, setError] = useState("");
    const [reportStatus, setReportStatus] = useState("");
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [reportReason, setReportReason] = useState("");
    const [otherReportReason, setOtherReportReason] = useState("");
    const [isReporting, setIsReporting] = useState(false);
    const [hasReported, setHasReported] = useState(false);
    const [skillSaving, setSkillSaving] = useState("");
    const [skillNotice, setSkillNotice] = useState("");
    const [logoFailed, setLogoFailed] = useState(false);
    const { qualifications, responsibilities } = splitRequirements(job.requirements);
    const matchedSkills = uniqueTags(job.profileMatch?.matchedSkills || []);
    const isMatchedSkill = skill => matchedSkills.some(profileSkill => equivalentSkill(profileSkill, skill));
    const qualificationSkills = uniqueTags(job.profileMatch?.jobSkills || matchedSkills);
    const scoreBreakdown = Array.isArray(job.profileMatch?.breakdown) ? job.profileMatch.breakdown : [];
    const summary = cleanSummary(job.summary);
    const logoUrl = companyLogo(job);
    const logoHue = companyHue(job.company);
    const jobDetails = [
        ["Location", faLocationDot, displayValue(job.location)],
        ["Workplace", faBuilding, displayValue(job.workplaceType)],
        ["Employment type", faClock, displayValue(job.employmentType)],
        ["Salary or compensation", faMoneyBillWave, formatCompensation(job.salary)],
        ["Career source", faBriefcase, displayValue(job.source)],
    ].filter(([, , value]) => value !== "N/A");

    useEffect(() => {
        if (!jobId) return;
        let active = true;
        getJobPosting(jobId).then(fetchedJob => {
            if (!active) return;
            const normalizedJob = {
                ...fetchedJob,
                jobUrl: fetchedJob.url,
                jobTitle: fetchedJob.title,
                externalJobId: fetchedJob.id,
                jobPostedAt: fetchedJob.postedAt,
            };
            setJob(normalizedJob);
            setJobUrl(normalizedJob.jobUrl || "");
            localStorage.setItem(`jobpilot.autofill.${jobId}`, JSON.stringify(normalizedJob));
        }).catch(requestError => {
            if (active && !job.jobUrl) setError(requestError.response?.data?.message || "Unable to load this job.");
        });
        return () => { active = false; };
    // The local fallback is intentionally read only when the stable ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId]);

    useEffect(() => {
        if (!skillNotice) return undefined;
        const timeout = window.setTimeout(() => setSkillNotice(""), 3000);
        return () => window.clearTimeout(timeout);
    }, [skillNotice]);

    useEffect(() => setLogoFailed(false), [job.company, job.jobUrl, job.url]);

    useEffect(() => {
        setReportStatus("");
        setHasReported(false);
    }, [jobUrl]);

    useEffect(() => {
        const persistedJobUrl = job.jobUrl;
        if (!isAdmin || !persistedJobUrl) return;
        let active = true;
        getJobReportStatus(persistedJobUrl)
            .then(reported => { if (active) setHasReported(reported); })
            .catch(requestError => console.error("Failed to check report status:", requestError));
        return () => { active = false; };
    }, [isAdmin, job.jobUrl]);

    const applicationPayload = {
        jobUrl,
        jobTitle: job.jobTitle,
        company: job.company,
        location: job.location,
        source: job.source,
        provider: job.provider,
        externalJobId: job.externalJobId,
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
        jobPostedAt: job.jobPostedAt,
        salary: job.salary,
        summary: job.summary,
        requirements: job.requirements,
    };

    const { status, showConfirmation, setShowConfirmation, isConfirming, error: extensionError,
        openWithExtension, confirmApplied } = useExtensionApplication(applicationPayload);

    const reportSelectedJob = async () => {
        const reasonDetail = otherReportReason.trim();
        if (!reportReason || (reportReason === "Other" && !reasonDetail)) return;
        setIsReporting(true);
        setReportStatus("");
        try {
            await reportJob({ ...applicationPayload, reason:reportReason, reasonDetail });
            setReportStatus("Reported and hidden from users.");
            setHasReported(true);
            setShowReportDialog(false);
        } catch (requestError) {
            if (requestError.response?.status === 409) {
                setHasReported(true);
                setShowReportDialog(false);
                setReportStatus("");
            } else {
                setReportStatus(requestError.response?.data?.message || "Unable to report this job.");
            }
        } finally {
            setIsReporting(false);
        }
    };

    const closeReportDialog = () => {
        if (isReporting) return;
        setShowReportDialog(false);
    };

    const toggleQualificationSkill = async skill => {
        if (skillSaving) return;
        const wasMatched = isMatchedSkill(skill);
        setSkillSaving(skill);
        setSkillNotice("");
        setError("");
        try {
            const profile = await getUserProfile();
            const profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
            const nextSkills = wasMatched
                ? profileSkills.filter(profileSkill => !equivalentSkill(profileSkill, skill))
                : uniqueTags([...profileSkills, skill]);
            await updateUserProfileSection("skills", nextSkills);

            if (jobId) {
                const fetchedJob = await getJobPosting(jobId);
                const normalizedJob = {
                    ...fetchedJob,
                    jobUrl: fetchedJob.url,
                    jobTitle: fetchedJob.title,
                    externalJobId: fetchedJob.id,
                    jobPostedAt: fetchedJob.postedAt,
                };
                setJob(normalizedJob);
                localStorage.setItem(`jobpilot.autofill.${jobId}`, JSON.stringify(normalizedJob));
            } else {
                setJob(current => ({ ...current, profileMatch: {
                    ...current.profileMatch,
                    matchedSkills: wasMatched
                        ? (current.profileMatch?.matchedSkills || []).filter(profileSkill => !equivalentSkill(profileSkill, skill))
                        : uniqueTags([...(current.profileMatch?.matchedSkills || []), skill]),
                } }));
            }
            setSkillNotice(`“${skill}” ${wasMatched ? "unselected" : "selected"}. This choice will apply to future job matches.`);
        } catch (requestError) {
            setError(requestError.response?.data?.message || `Unable to update ${skill}.`);
        } finally {
            setSkillSaving("");
        }
    };

    return (
        <main className="autofill-page">
            <section className="autofill-card">
                <div className="autofill-heading">
                    <div>
                        <span className="autofill-eyebrow">Application assistant</span>
                        <div className="autofill-company-identity">
                            <div className="autofill-company-logo" style={{ "--company-hue": logoHue }}>
                                {!logoFailed && logoUrl && <img src={logoUrl} alt="" onError={() => setLogoFailed(true)}/>}<span>{companyInitials(job.company)}</span>
                            </div>
                            <strong>{job.company || "Job application"}</strong>
                        </div>
                        <h1>{job.jobTitle || "Autofill an application"}</h1>
                    </div>
                    <div className="autofill-heading-actions">
                        <span className={`autofill-status status-${status}`}>{status}</span>
                    </div>
                </div>

                {(jobDetails.length > 0 || job.profileMatch) && <div className="job-overview-row">
                    {jobDetails.length > 0 && <div className="job-detail-grid">{jobDetails.map(([label, icon, value]) => <div title={label} key={label}><FontAwesomeIcon icon={icon}/><strong>{value}</strong></div>)}</div>}
                    {job.profileMatch && <aside className={`job-detail-match ${job.profileMatch.level}`} aria-label="Profile match score">
                        <div className="job-match-summary"><strong>{job.profileMatch.score}%</strong><span>{job.profileMatch.level} match</span></div>
                        {scoreBreakdown.length > 0 && <div className="job-match-breakdown">{scoreBreakdown.map(item => <div className="job-match-breakdown-row" title={item.detail} key={item.key || item.label}>
                            <div><span>{item.label}</span><strong>{item.percentage}%</strong></div>
                        </div>)}</div>}
                    </aside>}
                </div>}

                {(job.provider || job.tags?.length > 0) && <div className="autofill-job-tags" aria-label="Job details">
                    {job.provider && <span>{job.provider}</span>}
                    {uniqueTags(job.tags).slice(0, 5).map(tag => <span key={tag.toLocaleLowerCase()}>{tag}</span>)}
                </div>}

                {(summary || job.requirements?.length > 0) && <section className="job-description-panel">
                    {summary && <p className="job-summary">{summary}</p>}
                    {(qualifications.length > 0 || qualificationSkills.length > 0) && <section className="qualification-panel"><div className="qualification-heading"><div><span>Key criteria</span><h3>Qualifications</h3><p>These skills are detected from this job. <strong>Click a tag</strong> to add or remove it from your Profile, based on your actual expertise. Your choices are private and are used for future job matches and applications.</p></div>{matchedSkills.length > 0 && <em><FontAwesomeIcon icon={faThumbsUp}/> Represents the skills you have</em>}</div>{qualificationSkills.length > 0 && <div className="qualification-skill-tags" aria-label="Skills detected from this job">{qualificationSkills.map(skill => { const matched = isMatchedSkill(skill); return <button type="button" className={matched ? "matched" : ""} aria-pressed={matched} disabled={Boolean(skillSaving)} onClick={() => toggleQualificationSkill(skill)} key={skill}>{matched && <FontAwesomeIcon icon={faThumbsUp}/>} {skill}{skillSaving === skill && <span className="skill-saving">…</span>}</button>; })}</div>}<ul>{qualifications.map((requirement, index) => <li key={`${requirement}-${index}`}>{requirement}</li>)}</ul></section>}
                    {responsibilities.length > 0 && <section className="job-detail-section"><h3><FontAwesomeIcon icon={faListCheck}/> Responsibilities</h3><ul>{responsibilities.map((requirement, index) => <li key={`${requirement}-${index}`}>{requirement}</li>)}</ul></section>}
                </section>}

                <label className="application-url-label">
                    <span className="application-url-heading">Application URL <span className="autofill-help-icon" tabIndex="0" aria-label="How Autofill works"><FontAwesomeIcon icon={faCircleInfo}/><span className="autofill-help-tooltip" role="tooltip"><b>How Autofill works</b><span>Open the application with JobPilot to scan its fields automatically. Review your answers before submitting. When the site confirms submission, JobPilot records your application and closes these application tabs.</span></span></span></span>
                    <div className={`job-url-section${isAdmin ? "" : " no-report"}`}>
                        <input type="url" maxLength={MAX_INPUT_LENGTH} value={jobUrl} onChange={event => setJobUrl(event.target.value)} disabled={isConfirming} />
                        <Button onClick={openWithExtension} disabled={hasReported || isConfirming}>{hasReported ? "Reported" : "Open with extension"}</Button>
                        {isAdmin && <button className="report-job-button" type="button" disabled={hasReported} onClick={()=>setShowReportDialog(true)}>{hasReported ? "Reported" : "Report job"}</button>}
                    </div>
                </label>

                {reportStatus && <div className="autofill-report-status" role="status">{reportStatus}</div>}

                {(error || extensionError) && <div className="autofill-error" role="alert">{error || extensionError}</div>}

                {["extension", "closed", "submitted"].includes(status) && <button className="finished-link" type="button" onClick={() => setShowConfirmation(true)}>I finished applying</button>}
            </section>

            {skillNotice && <div className="skill-snackbar" role="status" aria-live="polite"><FontAwesomeIcon icon={faCircleCheck}/><span>{skillNotice}</span></div>}

            {showConfirmation && (
                <div className="confirmation-backdrop">
                    <section className="application-confirmation" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
                        <button className="confirmation-close" type="button" onClick={() => setShowConfirmation(false)} disabled={isConfirming} aria-label="Close">×</button>
                        <div className="confirmation-icon">✓</div>
                        <h2 id="confirmation-title">Did you apply?</h2>
                        <p>Let us know so JobPilot can track your application and keep your job list current.</p>
                        {extensionError && <p className="autofill-error" role="alert">{extensionError}</p>}
                        <button className="confirm-applied" type="button" onClick={confirmApplied} disabled={isConfirming}>{isConfirming ? "Saving…" : "Yes, I applied!"}</button>
                        <button className="confirm-not-applied" type="button" disabled={isConfirming} onClick={() => setShowConfirmation(false)}>No, I didn&apos;t apply</button>
                    </section>
                </div>
            )}
            {isAdmin && showReportDialog && <div className="confirmation-backdrop report-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeReportDialog();}}>
                <section className="application-confirmation report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
                    <button className="confirmation-close" type="button" onClick={closeReportDialog} aria-label="Close">×</button>
                    <span className="report-dialog-eyebrow">Administrator action</span>
                    <h2 id="report-title">Why are you reporting this job?</h2>
                    <p className="report-dialog-intro">Choose a reason. Reporting immediately hides this job from every user.</p>
                    <div className="report-reasons">{REPORT_REASONS.map(reason=><label className={reportReason===reason ? "selected" : ""} key={reason}>
                        <input type="radio" name="report-reason" value={reason} checked={reportReason===reason} onChange={event=>setReportReason(event.target.value)}/>
                        <span>{reason}</span><i aria-hidden="true">✓</i>
                    </label>)}</div>
                    {reportReason === "Other" && <label className="other-report-field">
                        <textarea autoFocus maxLength={MAX_INPUT_LENGTH} value={otherReportReason} onChange={event=>setOtherReportReason(event.target.value)} placeholder="Tell the moderator what prevented you from applying" />
                        <span>{otherReportReason.length}/{MAX_INPUT_LENGTH}</span>
                    </label>}
                    <div className="report-dialog-actions">
                        <button className="confirm-not-applied" type="button" disabled={isReporting} onClick={closeReportDialog}>Cancel</button>
                        <button className="confirm-applied" type="button" disabled={isReporting || !reportReason || (reportReason === "Other" && !otherReportReason.trim())} onClick={reportSelectedJob}>{isReporting ? "Hiding…" : "Report and hide job"}</button>
                    </div>
                </section>
            </div>}
        </main>
    );
};

export default FillApplication;
