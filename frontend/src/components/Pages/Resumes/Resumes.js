import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {Snackbar, Alert, CircularProgress, Button} from '@mui/material';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheck, faDownload, faEllipsis, faFileLines, faPencil, faPlus,
    faRotate, faStar, faTrash, faUpload, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
    createResume, deleteResume, exportResume, getResumes, setPrimaryResume, updateResume, parseResumeProfile,
} from "../../../connector";
import "./Resumes.scss";

const MAX_RESUMES = 5;
const acceptedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const acceptedExtensions = /\.(pdf|doc|docx)$/i;
const emptyUpload = { displayName: "", targetJobTitle: "", file: null };

const readableDate = value => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
const fileStem = name => name.replace(/\.[^.]+$/, "");

const ResumeModal = ({ mode, resume, onClose, onSubmit, pending, parseByDefault=false }) => {
    const [values, setValues] = useState(mode === "edit"
        ? { displayName: resume.display_name, targetJobTitle: resume.target_job_title || "", file: null }
        : {...emptyUpload, parseProfile:parseByDefault});
    const [error, setError] = useState("");
    const fileInput = useRef(null);
    const update = key => event => setValues(current => ({ ...current, [key]: event.target.value }));
    const chooseFile = event => {
        const file = event.target.files?.[0] || null;
        if (!file) return;
        if (file.size > 10 * 1024 * 1024 || (!acceptedTypes.includes(file.type) && !acceptedExtensions.test(file.name))) {
            setError("Choose a PDF, DOC, or DOCX file no larger than 10 MB.");
            return;
        }
        setError("");
        setValues(current => ({ ...current, file, displayName: current.displayName || fileStem(file.name) }));
    };
    const submit = event => {
        event.preventDefault();
        if (!values.displayName.trim()) return setError("Enter a name for this résumé.");
        if (mode === "upload" && !values.file) return setError("Select a résumé file to upload.");
        onSubmit({ ...values, displayName: values.displayName.trim(), targetJobTitle: values.targetJobTitle.trim() });
    };
    const isUpload = mode === "upload";
    return <div className="resume-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
        <form className="resume-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="resume-modal-title">
            <div className="resume-modal-heading"><div><span>{isUpload ? "Add a résumé" : "Edit résumé"}</span><h2 id="resume-modal-title">{isUpload ? "Upload your résumé" : "Update résumé details"}</h2></div><button type="button" aria-label="Close" onClick={onClose}><FontAwesomeIcon icon={faXmark}/></button></div>
            {isUpload && <div className={`resume-file-picker${values.file ? " selected" : ""}`}><FontAwesomeIcon icon={faFileLines}/><div><strong>{values.file ? values.file.name : "Select a résumé file"}</strong><small>{values.file ? `${Math.ceil(values.file.size / 1024)} KB · ready to upload` : "PDF, DOC, or DOCX · maximum 10 MB"}</small></div><button type="button" onClick={() => fileInput.current?.click()}>{values.file ? "Change" : "Browse files"}</button><input ref={fileInput} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseFile}/></div>}
            <label><span className="resume-field-label">Résumé name <b>*</b></span><input value={values.displayName} maxLength="199" placeholder="e.g. Software Engineer résumé" onChange={update("displayName")}/></label>
            <label>Target job title<input value={values.targetJobTitle} maxLength="199" placeholder="e.g. Software Engineer" onChange={update("targetJobTitle")}/></label>
            {isUpload && <div className="resume-parse-option"><label><input type="checkbox" checked={Boolean(values.parseProfile)} disabled={pending} onChange={event=>setValues(current=>({...current,parseProfile:event.target.checked}))}/> Parse this résumé to autofill my profile</label><p>Sends résumé text to OpenAI to fill missing contact details, education, work experience and skills. Existing answers stay unchanged. PDF or DOCX required; review the results afterward.</p></div>}
            {error && <p className="resume-form-error" role="alert">{error}</p>}
            <div className="resume-modal-actions"><button type="button" className="resume-secondary" disabled={pending} onClick={onClose}>Cancel</button><button className="resume-primary" disabled={pending} type="submit"><FontAwesomeIcon icon={isUpload ? faUpload : faCheck}/>{pending ? (values.parseProfile ? "Uploading & parsing…" : "Saving…") : isUpload ? (values.parseProfile ? "Upload & parse" : "Upload résumé") : "Save changes"}</button></div>
        </form>
    </div>;
};

const Resumes = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [resumes, setResumes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [menuId, setMenuId] = useState(null);
    const [modal, setModal] = useState(null);
    const [pending, setPending] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [parseTarget, setParseTarget] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [parsedSuccessfully, setParsedSuccessfully] = useState(false);

    const refresh = async (preserveError=false) => {
        setLoading(true);
        try { setResumes(await getResumes()); if (!preserveError) setError(""); }
        catch (requestError) { setError(requestError.response?.data?.message || "We couldn't load your résumés."); }
        finally { setLoading(false); }
    };
    useEffect(() => { refresh(); }, []);
    useEffect(() => {
        if (!(location.state?.editFromProfile || location.state?.uploadAndParse) || loading || error) return;
        const resume = resumes.find(item => item.is_primary) || resumes[0];
        if (location.state?.uploadAndParse && resumes.length >= MAX_RESUMES) setParseTarget(resume);
        else setModal(location.state?.uploadAndParse ? {mode:'upload',parseByDefault:true} : resume ? {mode: 'edit', resume} : {mode: 'upload'});
        navigate(location.pathname, {replace: true, state: null});
    }, [location, loading, error, resumes, navigate]);
    useEffect(() => {
        const closeMenu = () => setMenuId(null);
        document.addEventListener("click", closeMenu);
        return () => document.removeEventListener("click", closeMenu);
    }, []);

    const showNotice = message => { setParsedSuccessfully(false); setNotice(message); };
    const parseIntoProfile = async id => {
        setNotice(''); setParsedSuccessfully(false); setParsing(true);
        try {
            await parseResumeProfile(id);
            setParsedSuccessfully(true);
            setNotice('Résumé parsed successfully. Missing profile information filled—review it in Profile.');
        } finally { setParsing(false); }
    };
    const submitModal = async values => {
        if (pending) return;
        setPending(true);
        setError('');
        try {
            if (modal.mode === "upload") {
                const data = new FormData();
                data.append("file", values.file);
                data.append("displayName", values.displayName);
                data.append("targetJobTitle", values.targetJobTitle);
                const uploaded=await createResume(data);
                setModal(null);
                if (values.parseProfile) {
                    try {
                        await parseIntoProfile(uploaded.id);
                    } catch (parseError) {
                        setError(`Résumé uploaded, but parsing failed. ${parseError.response?.data?.message || 'Please try again using Parse into Profile from its actions menu.'}`);
                    }
                } else showNotice("Résumé uploaded successfully.");
            } else {
                await updateResume(modal.resume.id, values);
                showNotice("Résumé details updated.");
            }
            setModal(null);
            await refresh(true);
        } catch (requestError) { setError(requestError.response?.data?.message || "We couldn't save that résumé."); }
        finally { setPending(false); }
    };
    const setPrimary = async resume => {
        try { await setPrimaryResume(resume.id); await refresh(); showNotice(`“${resume.display_name}” is now your primary résumé.`); }
        catch (requestError) { setError(requestError.response?.data?.message || "We couldn't update your primary résumé."); }
    };
    const download = async resume => {
        try {
            const response = await exportResume(resume.id);
            const link = document.createElement("a");
            link.href = URL.createObjectURL(response.data);
            link.download = resume.file_name;
            link.click();
            URL.revokeObjectURL(link.href);
            showNotice("Your résumé download has started.");
        } catch (requestError) { setError(requestError.response?.data?.message || "We couldn't export that résumé."); }
    };
    const deleteItem = async resume => {
        try { await deleteResume(resume.id); setConfirmDelete(null); await refresh(); showNotice("Résumé deleted."); }
        catch (requestError) { setError(requestError.response?.data?.message || "We couldn't delete that résumé."); }
    };
    const updateProfile = async () => {
        if (pending) return;
        setPending(true); setError('');
        const id=parseTarget.id;
        setParseTarget(null);
        try { await parseIntoProfile(id); }
        catch (parseError) { setError(parseError.response?.data?.message || 'Parsing failed. Your saved résumé is unchanged.'); setParseTarget(null); }
        finally { setPending(false); }
    };

    return <main className="resumes-page"><section className="resumes-shell">
        <header className="resumes-heading"><div><span>Application materials</span><h1>Résumés</h1><p>Keep tailored versions ready for every opportunity.</p></div><button className="resume-primary" type="button" disabled={resumes.length >= MAX_RESUMES} onClick={() => setModal({ mode: "upload" })}><FontAwesomeIcon icon={faPlus}/> Add résumé</button></header>
        <section className="resume-limit" aria-label="Resume storage information"><div className="resume-limit-icon"><FontAwesomeIcon icon={faFileLines}/></div><p><strong>{resumes.length} of {MAX_RESUMES} résumé slots used.</strong> Keep tailored versions organized, then choose the one you want to use as primary.</p></section>
        {error && <div className="resume-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><FontAwesomeIcon icon={faXmark}/></button></div>}
        <section className="resume-list" aria-busy={loading}>
            <div className="resume-table-head"><span>Résumé</span><span>Target job title</span><span>Last modified</span><span>Created</span><span className="resume-actions-column">Actions</span></div>
            {loading ? <div className="resume-empty">Loading your résumés…</div> : resumes.length === 0 ? <div className="resume-empty"><div><FontAwesomeIcon icon={faFileLines}/></div><h2>No résumés yet</h2><p>Upload a PDF or Word document to start building your collection.</p><button className="resume-primary" type="button" onClick={() => setModal({ mode: "upload" })}><FontAwesomeIcon icon={faUpload}/> Upload résumé</button></div> : resumes.map(resume => <article className="resume-row" key={resume.id}>
                <div className="resume-file"><span className="resume-file-icon"><FontAwesomeIcon icon={faFileLines}/></span><div><strong title={resume.display_name}>{resume.display_name}</strong>{resume.is_primary && <em><FontAwesomeIcon icon={faStar}/> Primary</em>}<small>{resume.file_name}</small></div></div>
                <div className="resume-cell resume-target"><span className="resume-mobile-label">Target role</span>{resume.target_job_title || "—"}</div>
                <div className="resume-cell"><span className="resume-mobile-label">Modified</span>{readableDate(resume.updated_at)}</div>
                <div className="resume-cell"><span className="resume-mobile-label">Created</span>{readableDate(resume.created_at)}</div>
                <div className="resume-menu-wrap" onClick={event => event.stopPropagation()}><button className="resume-menu-button" type="button" aria-expanded={menuId === resume.id} aria-label={`Actions for ${resume.display_name}`} onClick={() => setMenuId(menuId === resume.id ? null : resume.id)}><FontAwesomeIcon icon={faEllipsis}/></button>{menuId === resume.id && <div className="resume-menu">
                    {!resume.is_primary && <button onClick={() => { setMenuId(null); setPrimary(resume); }}><FontAwesomeIcon icon={faStar}/> Use as primary</button>}
                    <button onClick={() => { setMenuId(null); setModal({ mode: "edit", resume }); }}><FontAwesomeIcon icon={faPencil}/> Edit résumé info</button>
                    <button disabled={pending} onClick={() => { setMenuId(null); setParseTarget(resume); }}><FontAwesomeIcon icon={faRotate}/> Parse into Profile</button>
                    <button onClick={() => { setMenuId(null); download(resume); }}><FontAwesomeIcon icon={faDownload}/> Export</button>
                    <button className="resume-delete-action" onClick={() => { setMenuId(null); setConfirmDelete(resume); }}><FontAwesomeIcon icon={faTrash}/> Delete</button>
                </div>}</div>
            </article>)}
        </section>
        {resumes.length >= MAX_RESUMES && <p className="resume-cap-note">Delete a résumé before adding another one.</p>}
    </section>
    <Snackbar key={parsing ? 'parsing' : notice} open={parsing || Boolean(notice)} autoHideDuration={parsing ? null : 6000} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{zIndex:10020}} onClose={(_,reason)=>{if(!parsing && reason!=='clickaway')setNotice('');}}>
        <Alert severity={parsing ? 'info' : 'success'} variant="filled" role="status" icon={parsing ? <CircularProgress size={20} color="inherit"/> : undefined} onClose={parsing ? undefined : ()=>setNotice('')} action={parsedSuccessfully && !parsing ? <><Button color="inherit" size="small" onClick={()=>navigate('/profile')}>View Profile</Button><Button color="inherit" size="small" aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</Button></> : undefined} sx={{bgcolor:parsing ? '#3361ae' : '#176b51',color:'#fff',borderRadius:'12px',boxShadow:'0 8px 32px rgba(16,50,38,.2)',alignItems:'center',maxWidth:'min(520px, calc(100vw - 32px))',overflowWrap:'anywhere'}}>
            {parsing ? 'Parsing résumé and filling missing profile information…' : notice}
        </Alert>
    </Snackbar>
    {modal && <ResumeModal mode={modal.mode} resume={modal.resume} parseByDefault={modal.parseByDefault} onClose={() => !pending && setModal(null)} onSubmit={submitModal} pending={pending}/>}
    {parseTarget && <div className="resume-modal-backdrop"><section className="resume-modal" role="dialog" aria-modal="true" aria-labelledby="parse-title"><h2 id="parse-title">Parse résumé into Profile?</h2><p>Send the text of “{parseTarget.display_name}” to OpenAI to fill missing contact details, education, work experience and skills. Existing answers and Equal Employment information will not be replaced.</p><p>Use a text-based PDF or DOCX. Review your profile after parsing.</p><div className="resume-modal-actions"><button className="resume-secondary" disabled={pending} onClick={()=>setParseTarget(null)}>Cancel</button><button className="resume-primary" disabled={pending} onClick={updateProfile}>{pending ? 'Parsing…' : 'Parse & fill Profile'}</button></div></section></div>}
    {confirmDelete && <div className="resume-modal-backdrop"><section className="resume-confirm" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this résumé?</h2><p>“{confirmDelete.display_name}” will be removed permanently. This can’t be undone.</p><div><button className="resume-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="resume-danger" onClick={() => deleteItem(confirmDelete)}>Delete résumé</button></div></section></div>}
    </main>;
};

export default Resumes;
