import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBriefcase, faFileArrowUp, faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { SuggestField } from "../Profile/ProfileFields";
import { JOB_TITLES } from "../Profile/profileSuggestions";
import "./Loops.scss";
import { getAiAutofillReviews } from "../../../connector";

const INITIAL_FORM = { titles: [], locations: [], resume: null };

const Loops = () => {
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState(INITIAL_FORM);
    const [error, setError] = useState("");
    const [reviews, setReviews] = useState([]);

    useEffect(() => { getAiAutofillReviews().then(setReviews).catch(() => setReviews([])); }, []);

    const openCreate = () => { setForm(INITIAL_FORM); setError(""); setIsCreating(true); };
    const submit = event => {
        event.preventDefault();
        if (!form.titles.length || !form.locations.length || !form.resume) {
            setError("Add at least one job title, one location, and a résumé to continue.");
            return;
        }
        // Loop execution and persistence will be connected in a later phase.
        setIsCreating(false);
        setForm(INITIAL_FORM);
        setError("");
    };

    return <main className="loops-page">
        <section className="loops-shell">
            {isCreating ? <>
                <header className="loops-heading"><button className="loops-back" type="button" onClick={() => setIsCreating(false)}><FontAwesomeIcon icon={faArrowLeft}/> My Loops</button><span>New loop</span><h1>Set up your job search</h1><p>Choose the roles and places that matter most. We’ll use these details when Loop automation is ready.</p></header>
                <form className="loop-form" onSubmit={submit}>
                    <div className="loop-form-heading"><span className="loop-step">1</span><div><h2>Search details</h2><p>Each item can be selected from a suggestion or entered directly.</p></div></div>
                    <div className="loop-fields">
                        <SuggestField label="Job titles you’re seeking" multiple required value={form.titles} options={JOB_TITLES} onChange={titles => setForm(current => ({ ...current, titles }))} helperText="Add one or more roles, such as Software Engineer or Data Engineer."/>
                        <SuggestField label="Preferred locations" multiple required kind="locations" value={form.locations} onChange={locations => setForm(current => ({ ...current, locations }))} helperText="Add cities, states, or locations where you want to work."/>
                    </div>
                    <label className="loop-resume"><span><FontAwesomeIcon icon={faFileArrowUp}/> Résumé <b>*</b></span><input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => setForm(current => ({ ...current, resume: event.target.files?.[0] || null }))}/><small>{form.resume ? `${form.resume.name} selected` : "PDF, DOC, or DOCX. This file stays local in this preview."}</small></label>
                    {error && <p className="loop-error" role="alert">{error}</p>}
                    <div className="loop-actions"><button type="button" className="loop-cancel" onClick={() => setIsCreating(false)}>Cancel</button><button type="submit" className="loop-submit">Create Loop</button></div>
                </form>
            </> : <>
                <header className="loops-heading loops-list-heading"><div><span>Job search automation</span><h1>My Loops</h1><p>Create focused job-search plans. Your active loops will appear here.</p></div><button className="loop-new" type="button" onClick={openCreate}><FontAwesomeIcon icon={faPlus}/> New Loop</button></header>
                {reviews.length > 0 && <section className="loops-ai-reviews"><span>Application assistant</span><h2>Waiting for Review</h2><p>AI-assisted answers are waiting for you to verify in the application browser.</p><div>{reviews.map(review => <article key={review.id}><strong>{review.job_title || "Job application"}</strong><span>{review.company || "Company not provided"}</span><small>{(review.answers || []).length} suggested answers · {(review.unresolved_fields || []).length} questions need your input</small></article>)}</div></section>}
                <section className="loops-empty" aria-live="polite"><div className="loops-empty-icon"><FontAwesomeIcon icon={faLayerGroup}/></div><h2>No loops yet</h2><p>Create your first loop to define the roles, locations, and résumé you want to use.</p><button type="button" onClick={openCreate}><FontAwesomeIcon icon={faBriefcase}/> Create a Loop</button></section>
            </>}
        </section>
    </main>;
};

export default Loops;
