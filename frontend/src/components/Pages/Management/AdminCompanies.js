import React, { useCallback, useEffect, useState } from "react";
import {
    addCareerSource,
    getCareerSourceDiscovery,
    getCareerSources,
    previewCareerSource,
} from "../../../connector";
import "./ManagementPages.scss";

const discoveryMessage = discovery => {
    if (discovery.status === "complete") {
        const foundLabel = discovery.jobsFound === 1 ? "job" : "jobs";
        const addedLabel = discovery.newJobsAdded === 1 ? "was" : "were";
        return `${discovery.company} discovery is complete: ${discovery.jobsFound} matching U.S. technical ${foundLabel} ${addedLabel} added to Active Job Postings.`;
    }

    if (discovery.status === "failed") {
        return `${discovery.company} was saved, but its jobs could not be checked: ${discovery.error}`;
    }

    return `${discovery.company} was saved. Checking its careers site in the background—your existing job list remains available.`;
};

const AdminCompanies = () => {
    const [sources, setSources] = useState([]);
    const [input, setInput] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [discovery, setDiscovery] = useState(null);
    const [preview, setPreview] = useState(null);
    const [careerSearchUrl, setCareerSearchUrl] = useState("");

    const load = useCallback(() => getCareerSources()
        .then(setSources)
        .catch(error => setMessage(error.response?.data?.message || error.message)), []);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!discovery?.id || ["complete", "failed"].includes(discovery.status)) return undefined;

        let cancelled = false;
        const poll = async () => {
            try {
                const nextDiscovery = await getCareerSourceDiscovery(discovery.id);
                if (cancelled) return;
                setDiscovery(nextDiscovery);
                setMessage(discoveryMessage(nextDiscovery));
            } catch (error) {
                if (!cancelled) setMessage(error.response?.data?.message || error.message);
            }
        };

        void poll();
        const interval = setInterval(poll, 1500);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [discovery?.id, discovery?.status]);

    const submit = async event => {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage("");
        setCareerSearchUrl("");
        try {
            const result = await previewCareerSource(input);
            setPreview(result);
            setMessage(`${result.company} was verified. ${result.jobsFound} matching U.S. software-engineering jobs were found, including ${result.newJobsFound} new jobs.`);
        } catch (error) {
            setMessage(error.response?.data?.message || error.message);
            const companyName = input.trim();
            if (error.response?.status !== 409 && companyName && !/^https?:\/\//i.test(companyName)) {
                setCareerSearchUrl(`https://www.google.com/search?q=${encodeURIComponent(`${companyName} careers`)}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmAdd = async () => {
        setIsSubmitting(true);
        setMessage("");
        try {
            const result = await addCareerSource(input);
            setDiscovery(result.discovery);
            setMessage(discoveryMessage(result.discovery));
            setInput("");
            setPreview(null);
            await load();
        } catch (error) {
            setMessage(error.response?.data?.message || error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return <main className="management-page"><div className="management-shell">
        <header className="management-heading">
            <h1>Company Sources</h1>
            <p>Administrator-only management for official career sites.</p>
        </header>
        <section className="management-panel">
            <form className="management-form" onSubmit={submit}>
                <label className="full">Company name or careers URL
                    <input value={input} onChange={event => { setInput(event.target.value); setPreview(null); setCareerSearchUrl(""); }} placeholder="Official careers URL or company name" required disabled={isSubmitting} />
                </label>
                <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Checking source…" : "Check jobs"}</button>
                {preview && <button type="button" onClick={confirmAdd} disabled={isSubmitting}>Add verified company</button>}
            </form>
            {message && <p className={`management-message${discovery?.status === "failed" ? " error" : ""}`}>{message}</p>}
            {careerSearchUrl && <div className="career-search-fallback">
                <p>Automatic discovery could not validate this company. Search for its official careers page, copy that URL, then paste it into the field above.</p>
                <a href={careerSearchUrl} target="_blank" rel="noreferrer">Search Google for careers ↗</a>
            </div>}
            <div className="source-grid">
                {sources.map((source, index) => <div className="source-chip" key={`${source.company}-${index}`}>
                    <strong>{source.company}</strong><span>{source.provider} · {source.type}</span>
                </div>)}
            </div>
        </section>
    </div></main>;
};

export default AdminCompanies;
