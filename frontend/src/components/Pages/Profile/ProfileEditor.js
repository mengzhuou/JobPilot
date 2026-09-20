import React, { useEffect, useState } from "react";
import { SuggestField, PersonalLocations, TECH_SKILLS, OFFICE_OPTIONS, SEEKING_OPTIONS, asSelections } from './ProfileFields';

import { SCHOOLS, DEGREES, JOB_TITLES } from './profileSuggestions';
const COMPANY_OPTIONS = ["Walmart Global Tech", "Travelers", "MessageGears"];
let entryId = 0;
const entry = item => ({ ...item, _editorId: ++entryId });
const prepare = (section, value) => ['education','experience'].includes(section) ? value.map(entry) : value;
const EEO_OPTIONS = {
    "Authorized to work in the United States":["Yes","No"],
    "Requires employment sponsorship":["Yes","No"],
    "Citizenship status":["U.S. citizen","U.S. lawful permanent resident","Protected individual","Other"],
    Gender:["Female","Male","Non-binary","Choose not to disclose"],
    "Hispanic or Latino":["Yes","No","Choose not to disclose"],
    Race:["Asian","Black or African American","White","Two or more races","Choose not to disclose"],
    "Veteran status":["Not a protected veteran","Protected veteran","Choose not to disclose"],
    Disability:["No","Yes","Choose not to disclose"],
    "Sexual orientation":["Heterosexual","Bisexual","Gay","Lesbian","Choose not to disclose"],
    "Transgender experience":["No","Yes","Choose not to disclose"],
};

const toMonth = value => {
    if (!value || value === "Present") return "";
    if (/^\d{4}-\d{2}/.test(value)) return value.slice(0,7);
    const parsed = new Date(`1 ${value}`);
    return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}`;
};
const Field = ({ label, value, onChange, type="text", required=false, disabled=false, list, placeholder="" }) => <label className="profile-editor-field"><span>{required && <b>*</b>}{label}</span><input type={type} required={required} disabled={disabled} pattern={type === "text" && required ? ".*\\S.*" : undefined} maxLength={200} list={list} placeholder={placeholder} value={type === "month" ? toMonth(value) : value || ""} onChange={event => onChange(event.target.value)}/></label>;
const SelectField = ({ label, value, onChange, options, required=false }) => <label className="profile-editor-field"><span>{required && <b>*</b>}{label}</span><select required={required} value={value || ""} onChange={event => onChange(event.target.value)}><option value="" disabled>Choose an answer</option>{[...new Set([...options, ...(value ? [value] : [])])].map(option=><option key={option}>{option}</option>)}</select></label>;

const ProfileEditor = ({ section, value, onCancel, onSave, saving }) => {
    const [draft, setDraft] = useState(() => prepare(section, value));
    useEffect(() => setDraft(prepare(section, value)), [value, section]);
    const objectChange = (key, next) => setDraft(current => ({ ...current, [key]: next }));
    const itemChange = (index, key, next) => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item));
    const rowChange = (index, next) => setDraft(current => current.map((row, rowIndex) => rowIndex === index ? [row[0], next] : row));
    const linkChange = (index, href) => objectChange("links", draft.links.map((link, linkIndex) => linkIndex === index ? { ...link, href, value:href.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,"") } : link));
    const removeItem = index => setDraft(current => current.filter((_, itemIndex) => itemIndex !== index));
    const addEducation = () => setDraft(current => [...current,entry({school:"",degree:"",location:"",from:"",to:"",gpa:"",details:[]})]);
    const addExperience = () => setDraft(current => [...current,entry({company:"",title:"",jobType:"Full-time",location:"",from:"",to:"",current:false,summary:"",bullets:[]})]);
    const bulletChange = (itemIndex, bulletIndex, next) => setDraft(current => current.map((item,index) => index === itemIndex ? {...item,bullets:item.bullets.map((bullet,index2) => index2 === bulletIndex ? next : bullet)} : item));

    return <div className="profile-editor-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
        <aside className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
            <header><button type="button" onClick={onCancel} aria-label="Close profile editor">‹</button><h2 id="profile-editor-title">{section === "equalEmployment" ? "Equal Employment" : section === "experience" ? "Work Experience" : section[0].toUpperCase()+section.slice(1)}</h2><button className="header-update" type="submit" form="profile-edit-form" disabled={saving}>{saving ? "Updating…" : "Update"}</button></header>
            <p className="profile-editor-sync">ⓘ Updates to your profile will be synced to Autofill Information for future applications.</p>
            <form id="profile-edit-form" className="profile-editor-content" onSubmit={event => { event.preventDefault(); if (!saving && event.currentTarget.reportValidity()) onSave(['education','experience'].includes(section) ? draft.map(({_editorId, ...item}) => item) : draft); }}>
                {section === "personal" && <><div className="editor-grid three"><Field label="First Name" value={draft.firstName} onChange={next=>objectChange("firstName",next)} required/><Field label="Middle Name" value={draft.middleName} onChange={next=>objectChange("middleName",next)}/><Field label="Last Name" value={draft.lastName} onChange={next=>objectChange("lastName",next)} required/></div><Field label="Email" value={draft.email} onChange={next=>objectChange("email",next)} type="email" required/><div className="editor-grid phone"><SelectField label="Phone Type" value={draft.phoneType} onChange={next=>objectChange("phoneType",next)} options={["Mobile","Home","Work"]}/><label className="profile-editor-field"><span><b>*</b>Phone</span><div className="phone-input"><span>🇺🇸</span><b>+1</b><input required type="tel" maxLength={20} value={draft.phone || ""} placeholder="Enter your phone number" onChange={event=>objectChange("phone",event.target.value)}/></div></label></div><Field label="Address Line" value={draft.addressLine} onChange={next=>objectChange("addressLine",next)} required/><PersonalLocations draft={draft} setDraft={setDraft}/>{draft.links?.map((link,index)=><Field key={link.label} label={`${link.label} URL`} value={link.href} onChange={next=>linkChange(index,next)} type="url"/>)}</>}

                {section === "education" && <>
                    <p className="editor-section-intro">Your academic background<span>Search for a school and degree, or enter your own. Required fields are marked *.</span></p>
                    {draft.map((item,index)=><section className="education-edit-card" key={item._editorId} aria-label={`Education ${index+1}`}>
                        <div className="education-card-heading"><span className="education-number">{String(index+1).padStart(2,'0')}</span><div><h3>Education {index+1}</h3><p>School, qualification and attendance</p></div><button type="button" className="education-remove" onClick={()=>removeItem(index)} aria-label={`Remove education ${index+1}`}>Remove</button></div>
                        <SuggestField label="School Name" value={item.school} onChange={next=>itemChange(index,"school",next)} options={[...new Set([...SCHOOLS,...draft.map(entry=>entry.school).filter(Boolean)])]} required/>
                        <SuggestField label="Major / Degree" value={item.degree} onChange={next=>itemChange(index,"degree",next)} options={DEGREES} required/>
                        <div className="editor-grid education-location-row">
                            <SuggestField label="Location" kind="locations" value={item.location} onChange={next=>itemChange(index,"location",next)}/>
                            <label className="profile-editor-field"><span>GPA <small>(optional)</small></span><input aria-label="GPA" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" maxLength={6} placeholder="e.g. 3.95" value={item.gpa ?? item.details?.[0]?.replace("GPA ","") ?? ""} onChange={event=>{if (/^\d*(\.\d*)?$/.test(event.target.value)) itemChange(index,"gpa",event.target.value);}}/></label>
                        </div>
                        <div className="education-dates"><div className="editor-grid"><Field label="Start Date" value={item.from} onChange={next=>itemChange(index,"from",next)} type="month"/><Field label="End Date" disabled={item.current || item.to === "Present"} value={item.to} onChange={next=>itemChange(index,"to",next)} type="month"/></div><label className="current-check"><input type="checkbox" checked={Boolean(item.current || item.to === "Present")} onChange={event=>{itemChange(index,"current",event.target.checked);itemChange(index,"to",event.target.checked ? "Present" : "");}}/>I currently study here</label></div>
                    </section>)}
                    <button className="add-entry education-add" type="button" onClick={addEducation}>＋ Add Education</button>
                </>}

                {section === "experience" && <>{draft.map((item,index)=><fieldset key={item._editorId}><legend>Work Experience {index+1}<button type="button" className="icon-action" onClick={()=>removeItem(index)} aria-label={`Remove work experience ${index+1}`}>⌫</button></legend><SuggestField label="Job Title" value={item.title} onChange={next=>itemChange(index,"title",next)} options={JOB_TITLES} required/><SuggestField label="Company" value={item.company} onChange={next=>itemChange(index,"company",next)} options={[...new Set([...COMPANY_OPTIONS,...draft.map(entry=>entry.company).filter(Boolean)])]} required/><small className="field-tip">ⓘ Pick a suggested company for better accuracy.</small><div className="editor-grid"><SelectField label="Job Type" value={item.jobType || (item.title?.includes("Intern") ? "Internship" : "Full-time")} onChange={next=>itemChange(index,"jobType",next)} options={["Full-time","Part-time","Internship","Contract"]} required/><SuggestField label="Location" kind="locations" value={item.location} onChange={next=>itemChange(index,"location",next)}/></div><div className="editor-grid"><Field label="Start Date" value={item.from} onChange={next=>itemChange(index,"from",next)} type="month"/><Field label="End Date" disabled={item.current || item.to === "Present"} value={item.to} onChange={next=>itemChange(index,"to",next)} type="month"/></div><label className="current-check"><input type="checkbox" checked={Boolean(item.current || item.to === "Present")} onChange={event=>{itemChange(index,"current",event.target.checked);itemChange(index,"to",event.target.checked ? "Present" : "");}}/>I currently work here</label><Field label="Experience Summary" value={item.summary} onChange={next=>itemChange(index,"summary",next)}/><div className="bullet-editor"><span>Job Description</span>{item.bullets?.map((bullet,bulletIndex)=><label key={bulletIndex}>•<textarea maxLength={200} value={bullet} onChange={event=>bulletChange(index,bulletIndex,event.target.value)}/><button type="button" onClick={()=>itemChange(index,"bullets",item.bullets.filter((_,i)=>i!==bulletIndex))}>×</button></label>)}<button className="add-entry" type="button" onClick={()=>itemChange(index,"bullets",[...(item.bullets||[]),""])}>＋ Bullet point</button></div></fieldset>)}<button className="add-entry" type="button" onClick={addExperience}>＋ Add Work Experience</button><datalist id="company-options">{COMPANY_OPTIONS.map(option=><option key={option} value={option}/>)}</datalist></>}

                {section === "skills" && <SuggestField label="Search or add technical skills" multiple value={draft} options={TECH_SKILLS} onChange={setDraft} helperText="Choose a suggestion, or type a custom skill and press Enter."/>}
                {section === "preferences" && draft.map(([question,answer],index) => {
                    if (/seeking/i.test(question)) return <SuggestField key={question} label={question} multiple freeSolo={false} value={asSelections(answer,true)} options={SEEKING_OPTIONS} onChange={next=>rowChange(index,next)}/>;
                    if (/office/i.test(question)) return <SelectField key={question} label={question} value={answer} options={OFFICE_OPTIONS} onChange={next=>rowChange(index,next)}/>;
                    if (/location/i.test(question)) return <SuggestField key={question} label={question} multiple kind="locations" value={asSelections(answer)} onChange={next=>rowChange(index,next)} helperText="Select a city, or type a location and press Enter. Add as many as you need."/>;
                    return <Field key={question} label={question} value={answer} onChange={next=>rowChange(index,next)} type={question.includes("date") ? "date" : "text"}/>;
                })}
                {section === "equalEmployment" && <div className="eeo-editor">{draft.map(([question,answer],index)=><SelectField key={question} label={question} value={answer} onChange={next=>rowChange(index,next)} options={EEO_OPTIONS[question] || [answer,"Choose not to disclose"]} required/>)}</div>}
            </form>
            <footer><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" type="submit" form="profile-edit-form" disabled={saving}>{saving ? "Updating…" : "Update"}</button></footer>
        </aside>
    </div>;
};

export default ProfileEditor;
