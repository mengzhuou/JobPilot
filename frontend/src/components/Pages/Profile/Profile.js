import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faCheck, faCircleQuestion, faCode, faCopy, faEnvelope, faGlobe, faGraduationCap, faLocationDot, faLock, faPen, faPhone, faPlug, faRotate, faSliders, faUser } from "@fortawesome/free-solid-svg-icons";
import { createExtensionPairingCode, getExtensionConnections, getUserProfile, getResumes, revokeExtensionConnection, updateUserProfileSection } from "../../../connector";
import ProfileEditor from "./ProfileEditor";
import ProfileStrength from './ProfileStrengthCard';
import {connectExtension} from './connectExtension';
import EmptyProfilePrompt from './EmptyProfilePrompt';
import {profileStrength} from './profileCompleteness';
import { formatProfileMonth } from "./profileDates";
import { withApplicationQuestions } from "./profileQuestions";
import "./Profile.scss";
import "./ProfileRefinements.scss";
import "./ProfileExtension.scss";

const tabs = [["extension","Chrome Extension"],["personal","Personal"],["education","Education"],["experience","Work Experience"],["skills","Skills"],["preferences","Preferences"],["equal-employment","Equal Employment"]];
const EQUAL_EMPLOYMENT_FIELDS = ["Authorized to work in the United States","Requires employment sponsorship","Citizenship status","Gender","Hispanic or Latino","Race","Veteran status","Disability","Sexual orientation","Transgender experience"];
const emptyProfile = {
    personal: {links: ['LinkedIn', 'GitHub', 'Portfolio'].map(label => ({label, href: '', value: ''}))},
    education: [], experience: [], skills: [],
    preferences: [['Seeking', []], ['Office preference', ''], ['Preferred locations', []]], equalEmployment: [],
};
const normalizeProfile = profile => {
    const equalEmployment = withApplicationQuestions('equalEmployment', profile.equalEmployment);
    const existing = new Map(equalEmployment.map(row => [String(row?.[0] || "").toLowerCase(), row]));
    return {
        ...profile,
        personal: {...profile.personal, links: profile.personal?.links?.length ? profile.personal.links : emptyProfile.personal.links},
        preferences: withApplicationQuestions('preferences', [
            ...(profile.preferences || []),
            ...emptyProfile.preferences.filter(([label]) => !(profile.preferences || []).some(([existingLabel]) => existingLabel.toLowerCase() === label.toLowerCase())),
        ]),
        skills:Array.isArray(profile.skills) ? profile.skills : [...new Set(Object.values(profile.skills || {}).flat())],
        equalEmployment: [
            ...EQUAL_EMPLOYMENT_FIELDS.map(label => existing.get(label.toLowerCase()) || [label, ""]),
            ...equalEmployment.filter(row => !EQUAL_EMPLOYMENT_FIELDS.some(label => label.toLowerCase() === String(row?.[0] || "").toLowerCase())),
        ],
    };
};

const SocialIcon = ({ type }) => {
    if(String(type).toLowerCase() === "portfolio") return <FontAwesomeIcon icon={faGlobe}/>;
    const path = String(type).toLowerCase() === "linkedin"
        ? "M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96C2 21.32 2.69 22 3.55 22h16.9c.86 0 1.55-.68 1.55-1.52V3.52C22 2.68 21.31 2 20.45 2zM7.93 18.75H4.98V9.2h2.95v9.55zM6.45 7.89a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42zm12.3 10.86H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.74 1.36-1.53 2.79-1.53 2.99 0 3.58 1.97 3.58 4.53v5.25z"
        : "M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.2.8-.6v-2.1c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.2 4.4 4.4 0 0 1 .1-3.2s1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2a4.4 4.4 0 0 1 .1 3.2 4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z";
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path}/></svg>;
};

const SectionTitle = ({ icon, title, section, onEdit }) => <div className="profile-section-title"><div><FontAwesomeIcon icon={icon}/><h2>{title}</h2></div><button className="profile-edit" type="button" title={`Edit ${title}`} aria-label={`Edit ${title}`} onClick={() => onEdit(section)}><FontAwesomeIcon icon={faPen}/></button></div>;
const Timeline = ({ items }) => <div className="profile-timeline">{items.map((item,index)=><article className="profile-timeline-item" key={`${item.company || item.school}-${item.from}-${index}`}>
    <div className="profile-period"><span>{formatProfileMonth(item.from)}</span><b>→</b><span>{formatProfileMonth(item.to)}</span></div>
    <div className="profile-timeline-content"><div className="profile-role-heading"><div><h3>{item.company || item.school}</h3><p>{item.title || item.degree}</p>{item.fieldOfStudy && <p>Field of Study: {item.fieldOfStudy}</p>}</div>{item.location && <span>{item.location}</span>}</div>
        {item.gpa ? <p className="profile-detail">GPA {item.gpa}</p> : item.details?.filter(detail=>item.gpa === undefined || !/^GPA\s/i.test(detail)).map(detail=><p className="profile-detail" key={detail}>{detail}</p>)}
        {item.bullets?.length>0&&<ul>{item.bullets.map((bullet,bulletIndex)=><li key={bulletIndex}>{bullet}</li>)}</ul>}
    </div>
</article>)}</div>;
const DetailCards = ({ rows, className="" }) => <div className={`profile-detail-grid ${className}`}>{rows.map(([question,answer])=><article key={question}><span>{question}</span><strong>{Array.isArray(answer) ? answer.join(" · ") : answer}</strong></article>)}</div>;

const Profile = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [profileLoaded,setProfileLoaded]=useState(false);
    const [hasResume,setHasResume]=useState(null);
    const [profile, setProfile] = useState(() => normalizeProfile(emptyProfile));
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState("");
    const [pairing, setPairing] = useState(null);
    const [connections, setConnections] = useState([]);
    const [extensionBusy, setExtensionBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const editorValue = useMemo(() => editing ? profile[editing] : null, [editing, profile]);

    useEffect(() => {
        let active=true;
        getUserProfile().then(data => {if(active){setProfile(normalizeProfile(data));setProfileLoaded(true);}}).catch(error => {
            if (!active) return;
            if (error.response?.status === 404) {
                setProfileLoaded(true);
                setNotice('Start with any section below to create your application profile.');
            } else setNotice('Your profile could not be loaded. Please reload before editing.');
        });
        return () => { active=false; };
    }, [location.key]);
    useEffect(()=>{let active=true;getResumes().then(rows=>{if(active)setHasResume(rows.some(row=>row.is_primary));}).catch(()=>{});return()=>{active=false;};},[]);
    useEffect(() => { let active=true; getExtensionConnections().then(data => active && setConnections(data)).catch(() => {}); return () => { active=false; }; }, []);
    useEffect(() => {
        const rawHandoff = sessionStorage.getItem("jobpilot.profileResumeHandoff");
        if (!rawHandoff) return;
        try {
            const handoff = JSON.parse(rawHandoff);
            setNotice(`“${handoff.name}” is selected for your applications${handoff.targetJobTitle ? ` (${handoff.targetJobTitle})` : ""}. Review your Profile fields to keep Autofill accurate.`);
        } catch { /* Ignore an invalid local handoff. */ }
        sessionStorage.removeItem("jobpilot.profileResumeHandoff");
    }, [location.key]);
    const saveSection = async value => {
        setSaving(true); setNotice("");
        const nextValue = editing === "personal" ? { ...value, name:[value.firstName,value.middleName,value.lastName].filter(Boolean).join(" "), address:[value.addressLine,value.city,value.state,value.country,value.postalCode].filter(Boolean).join(", ") } : value;
        try { const updated = await updateUserProfileSection(editing, nextValue); setProfile(normalizeProfile(updated)); setProfileLoaded(true); setEditing(null); setNotice("Profile updated."); }
        catch (error) { setNotice(error.response?.data?.message || "Unable to update the profile."); }
        finally { setSaving(false); }
    };
    const generatePairingCode = async () => {
        setExtensionBusy(true); setCopied(false); setNotice("");
        try { setPairing(await createExtensionPairingCode()); }
        catch (error) { setNotice(error.response?.data?.message || "Unable to create an extension pairing code."); }
        finally { setExtensionBusy(false); }
    };
    const connectBrowser = async () => {
        setExtensionBusy(true);setNotice('');
        try {
            await connectExtension();
            setNotice('Extension connected. You can now autofill applications in Chrome.');
            setConnections(await getExtensionConnections());
        } catch(error){setNotice(error.response?.data?.message || error.message || 'Unable to connect the extension.');}
        finally{setExtensionBusy(false);}
    };
    const copyPairingCode = async () => {
        if (!pairing?.code) return;
        try { await navigator.clipboard.writeText(pairing.code); setCopied(true); }
        catch { setNotice("Copy was blocked by the browser. Select the code and copy it manually."); }
    };
    const revokeConnection = async id => {
        setExtensionBusy(true); setNotice("");
        try { await revokeExtensionConnection(id); setConnections(current => current.filter(connection => connection.id !== id)); setNotice("Chrome extension connection revoked."); }
        catch (error) { setNotice(error.response?.data?.message || "Unable to revoke the extension connection."); }
        finally { setExtensionBusy(false); }
    };

    return <main className="profile-page">
        <EmptyProfilePrompt eligible={profileLoaded && profileStrength(profile,hasResume).score===0} onUpload={()=>navigate('/resumes',{state:{uploadAndParse:true}})}/>
        <header className="profile-page-heading"><span>Application identity</span><h1>Profile</h1><p>The information JobPilot uses to understand your background and complete applications.</p></header>
        <div className="profile-privacy"><FontAwesomeIcon icon={faLock}/><span>Your profile data is private and used for your job applications.</span><span className="profile-privacy-help"><button type="button" aria-label="Learn how JobPilot protects your profile data"><FontAwesomeIcon icon={faCircleQuestion}/></button><span role="tooltip">Your profile data is used only to match jobs and complete applications you choose to open. JobPilot does not share it with recruiters or other third parties without your consent.</span></span><small>Stored securely in your account</small></div>
        <nav className="profile-tabs" aria-label="Profile sections">{tabs.map(([id,label])=><a key={id} href={`#${id}`}>{label}</a>)}</nav>
        {notice && <p className="profile-notice" role="status">{notice}</p>}
        <div className="profile-with-strength"><ProfileStrength profile={profile} hasResume={hasResume} loaded={profileLoaded} onEdit={setEditing} onResumes={()=>navigate('/resumes', {state:{editFromProfile:true}})}/><div className="profile-card">
            <section className="profile-section-card profile-extension" id="extension">
                <div className="profile-section-title"><div><FontAwesomeIcon icon={faPlug}/><h2>Chrome Autofill Extension</h2></div><span className="profile-extension-badge">Optional</span></div>
                <div className="profile-extension-layout">
                    <div className="profile-extension-copy">
                        <h3>Autofill in the browser you already use</h3>
                        <p>Connect the JobPilot Chrome extension to review detected fields beside an application and fill them from this Profile. The extension never submits an application.</p>
                        <ol><li>Load and pin the JobPilot extension in Chrome.</li><li>Sign in to your JobPilot account in this browser.</li><li>Click Connect extension below. No code to copy.</li></ol>
                        <button className="profile-extension-action" type="button" disabled={extensionBusy} onClick={connectBrowser}><FontAwesomeIcon icon={faPlug}/>{extensionBusy ? 'Connecting…' : 'Connect extension'}</button>
                        <details className="profile-manual-pairing"><summary><span>Connect with a code instead</span><span className="pairing-chevron" aria-hidden="true">⌄</span></summary><div><p>Use this if browser sign-in is unavailable. Generate a code, then enter it in the extension’s connection settings.</p><button className="profile-extension-action" type="button" disabled={extensionBusy} onClick={generatePairingCode}><FontAwesomeIcon icon={pairing ? faRotate : faPlug}/>{pairing ? "Generate a new code" : "Generate pairing code"}</button></div></details>
                    </div>
                    <div className={`profile-pairing-card ${pairing ? "has-code" : ""}`}>
                        {pairing ? <>
                            <span>ONE-TIME PAIRING CODE</span>
                            <button className="profile-pairing-code" type="button" onClick={copyPairingCode} title="Copy pairing code"><strong>{pairing.code}</strong><FontAwesomeIcon icon={copied ? faCheck : faCopy}/></button>
                            <small>{copied ? "Copied. Paste it into the JobPilot side panel." : `Expires ${new Date(pairing.expiresAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}. It can be used once.`}</small>
                        </> : <><FontAwesomeIcon icon={faLock}/><strong>{connections.length ? 'Browser connection available' : 'Connect securely with your account'}</strong><small>Click Connect extension to authorize this Chrome browser. Connections can be revoked below.</small></>}
                    </div>
                </div>
                {connections.length > 0 &&
                    <details className="profile-connection-manager"><summary><span><FontAwesomeIcon icon={faLock} /> Extension access <small>{connections.length} active {connections.length === 1 ? 'connection' : 'connections'}</small></span><span className="pairing-chevron" aria-hidden="true">⌄</span></summary><p>Manage access when you no longer use a connection. Reconnecting can create multiple sessions for the same browser.</p><div className="profile-extension-connections">{connections.map((connection, index) => <div key={connection.id}><div><strong>{connection.device_name} <small>Session {index + 1}</small></strong><span>{connection.last_used_at ? `Last used ${new Date(connection.last_used_at).toLocaleString()}` : `Connected ${new Date(connection.created_at).toLocaleString()}`}</span>
                                </div>
                            </div>)}
                        </div>
                    </details>}
            </section>
            <section className="profile-section-card" id="personal"><SectionTitle icon={faUser} title="Personal" section="personal" onEdit={setEditing}/><div className="profile-personal"><div className="profile-avatar">MO</div><div><h3>{profile.personal.name}</h3><div className="profile-contact-chips"><span><FontAwesomeIcon icon={faLocationDot}/>{profile.personal.address}</span><span><FontAwesomeIcon icon={faEnvelope}/>{profile.personal.email}</span><span><FontAwesomeIcon icon={faPhone}/>{profile.personal.phone}</span></div><div className="profile-links">{profile.personal.links?.map(link=><a key={link.label} href={link.href} target="_blank" rel="noreferrer" title={link.label} aria-label={`${link.label}: ${link.value}`}><SocialIcon type={link.label}/><span>{link.value}</span></a>)}</div></div></div></section>
            <section className="profile-section-card" id="education"><SectionTitle icon={faGraduationCap} title="Education" section="education" onEdit={setEditing}/><Timeline items={profile.education}/></section>
            <section className="profile-section-card" id="experience"><SectionTitle icon={faBriefcase} title="Work Experience" section="experience" onEdit={setEditing}/><Timeline items={profile.experience}/></section>
            <section className="profile-section-card" id="skills"><SectionTitle icon={faCode} title="Skills" section="skills" onEdit={setEditing}/><div className="profile-skills">{profile.skills.map(skill=><span key={skill}>{skill}</span>)}</div></section>
            <section className="profile-section-card" id="preferences"><SectionTitle icon={faSliders} title="Job Preferences" section="preferences" onEdit={setEditing}/><DetailCards rows={profile.preferences}/></section>
            <section className="profile-section-card sensitive" id="equal-employment"><SectionTitle icon={faLock} title="Equal Employment" section="equalEmployment" onEdit={setEditing}/><p className="profile-sensitive-note"><FontAwesomeIcon icon={faLock}/> These answers are sensitive. JobPilot uses them only when an application specifically requests them.</p><DetailCards rows={profile.equalEmployment} className="sensitive-cards"/></section>
        </div>
        </div>{editing && <ProfileEditor section={editing} value={editorValue} onCancel={() => setEditing(null)} onSave={saveSection} saving={saving}/>}
    </main>;
};

export default Profile;
