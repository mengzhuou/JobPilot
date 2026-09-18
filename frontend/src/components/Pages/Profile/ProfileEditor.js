import React, { useEffect, useState } from "react";

const SCHOOL_OPTIONS = ["Georgia Institute of Technology", "University of Texas at Dallas", "Texas A&M University"];
const COMPANY_OPTIONS = ["Walmart Global Tech", "Travelers", "MessageGears"];
const LOCATION_OPTIONS = ["Bentonville, AR", "Atlanta, GA", "McKinney, TX", "Dallas, TX"];
const EEO_OPTIONS = {
    "Authorized to work in the United States":["Yes","No"],
    "Requires employment sponsorship":["Yes","No"],
    "Citizenship status":["U.S. citizen","U.S. lawful permanent resident","Protected individual","Other"],
    Gender:["Female","Male","Non-binary","Choose not to disclose"],
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
const Field = ({ label, value, onChange, type="text", required=false, list, placeholder="" }) => <label className="profile-editor-field"><span>{required && <b>*</b>}{label}</span><input type={type} maxLength={200} list={list} placeholder={placeholder} value={type === "month" ? toMonth(value) : value || ""} onChange={event => onChange(event.target.value)}/></label>;
const SelectField = ({ label, value, onChange, options, required=false }) => <label className="profile-editor-field"><span>{required && <b>*</b>}{label}</span><select value={value || ""} onChange={event => onChange(event.target.value)}><option value="" disabled>Choose an answer</option>{options.map(option=><option key={option}>{option}</option>)}</select></label>;

const ProfileEditor = ({ section, value, onCancel, onSave, saving }) => {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value, section]);
    const objectChange = (key, next) => setDraft(current => ({ ...current, [key]: next }));
    const itemChange = (index, key, next) => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item));
    const rowChange = (index, next) => setDraft(current => current.map((row, rowIndex) => rowIndex === index ? [row[0], next] : row));
    const linkChange = (index, href) => objectChange("links", draft.links.map((link, linkIndex) => linkIndex === index ? { ...link, href, value:href.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,"") } : link));
    const removeItem = index => setDraft(current => current.filter((_, itemIndex) => itemIndex !== index));
    const addEducation = () => setDraft(current => [...current,{school:"",degree:"",location:"",from:"",to:"",gpa:"",details:[]}]);
    const addExperience = () => setDraft(current => [...current,{company:"",title:"",jobType:"Full-time",location:"",from:"",to:"",current:false,summary:"",bullets:[]}]);
    const bulletChange = (itemIndex, bulletIndex, next) => setDraft(current => current.map((item,index) => index === itemIndex ? {...item,bullets:item.bullets.map((bullet,index2) => index2 === bulletIndex ? next : bullet)} : item));

    return <div className="profile-editor-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
        <aside className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
            <header><button type="button" onClick={onCancel} aria-label="Close profile editor">‹</button><h2 id="profile-editor-title">{section === "equalEmployment" ? "Equal Employment" : section === "experience" ? "Work Experience" : section[0].toUpperCase()+section.slice(1)}</h2><button className="header-update" type="button" onClick={() => onSave(draft)} disabled={saving}>{saving ? "Updating…" : "Update"}</button></header>
            <p className="profile-editor-sync">ⓘ Updates to your profile will be synced to Autofill Information for future applications.</p>
            <div className="profile-editor-content">
                {section === "personal" && <><div className="editor-grid three"><Field label="First Name" value={draft.firstName} onChange={next=>objectChange("firstName",next)} required/><Field label="Middle Name" value={draft.middleName} onChange={next=>objectChange("middleName",next)}/><Field label="Last Name" value={draft.lastName} onChange={next=>objectChange("lastName",next)} required/></div><Field label="Email" value={draft.email} onChange={next=>objectChange("email",next)} type="email" required/><div className="editor-grid phone"><SelectField label="Phone Type" value={draft.phoneType} onChange={next=>objectChange("phoneType",next)} options={["Mobile","Home","Work"]}/><label className="profile-editor-field"><span><b>*</b>Phone</span><div className="phone-input"><span>🇺🇸</span><b>+1</b><input type="tel" maxLength={20} value={draft.phone || ""} placeholder="Enter your phone number" onChange={event=>objectChange("phone",event.target.value)}/></div></label></div><Field label="Address Line" value={draft.addressLine} onChange={next=>objectChange("addressLine",next)} list="address-options" required/><div className="editor-grid three"><SelectField label="Country/Region" value={draft.country} onChange={next=>objectChange("country",next)} options={["United States","Canada"]} required/><Field label="State/Province" value={draft.state} onChange={next=>objectChange("state",next)} required/><Field label="City" value={draft.city} onChange={next=>objectChange("city",next)} list="city-options" required/></div><Field label="Postal Code" value={draft.postalCode} onChange={next=>objectChange("postalCode",next)} required/>{draft.links?.map((link,index)=><Field key={link.label} label={`${link.label} URL`} value={link.href} onChange={next=>linkChange(index,next)} type="url"/>)}<datalist id="address-options"><option value="10732 Craven St"/></datalist><datalist id="city-options"><option value="McKinney"/><option value="Dallas"/><option value="Atlanta"/></datalist></>}

                {section === "education" && <>{draft.map((item,index)=><fieldset key={`${item.school}-${index}`}><legend>Education {index+1}<button type="button" className="icon-action" onClick={()=>removeItem(index)} aria-label={`Remove education ${index+1}`}>⌫</button></legend><Field label="School Name" value={item.school} onChange={next=>itemChange(index,"school",next)} list="school-options" required/><div className="editor-grid three"><Field label="Major / Degree" value={item.degree} onChange={next=>itemChange(index,"degree",next)} required/><Field label="Location" value={item.location} onChange={next=>itemChange(index,"location",next)} list="location-options"/><Field label="GPA" value={item.gpa || item.details?.[0]?.replace("GPA ","")} onChange={next=>{itemChange(index,"gpa",next);}}/></div><div className="editor-grid"><Field label="Start Date" value={item.from} onChange={next=>itemChange(index,"from",next)} type="month"/><Field label="End Date" value={item.to} onChange={next=>itemChange(index,"to",next)} type="month"/></div></fieldset>)}<button className="add-entry" type="button" onClick={addEducation}>＋ Add Education</button><datalist id="school-options">{SCHOOL_OPTIONS.map(option=><option key={option} value={option}/>)}</datalist></>}

                {section === "experience" && <>{draft.map((item,index)=><fieldset key={`${item.company}-${index}`}><legend>Work Experience {index+1}<button type="button" className="icon-action" onClick={()=>removeItem(index)} aria-label={`Remove work experience ${index+1}`}>⌫</button></legend><Field label="Job Title" value={item.title} onChange={next=>itemChange(index,"title",next)} required/><Field label="Company" value={item.company} onChange={next=>itemChange(index,"company",next)} list="company-options" required/><small className="field-tip">ⓘ Pick a suggested company for better accuracy.</small><div className="editor-grid"><SelectField label="Job Type" value={item.jobType || (item.title?.includes("Intern") ? "Internship" : "Full-time")} onChange={next=>itemChange(index,"jobType",next)} options={["Full-time","Part-time","Internship","Contract"]} required/><Field label="Location" value={item.location} onChange={next=>itemChange(index,"location",next)} list="location-options"/></div><div className="editor-grid"><Field label="Start Date" value={item.from} onChange={next=>itemChange(index,"from",next)} type="month"/><Field label="End Date" value={item.to} onChange={next=>itemChange(index,"to",next)} type="month"/></div><label className="current-check"><input type="checkbox" checked={item.current || item.to === "Present"} onChange={event=>{itemChange(index,"current",event.target.checked);if(event.target.checked)itemChange(index,"to","Present");}}/>I currently work here</label><Field label="Experience Summary" value={item.summary} onChange={next=>itemChange(index,"summary",next)}/><div className="bullet-editor"><span>Job Description</span>{item.bullets?.map((bullet,bulletIndex)=><label key={bulletIndex}>•<textarea maxLength={200} value={bullet} onChange={event=>bulletChange(index,bulletIndex,event.target.value)}/><button type="button" onClick={()=>itemChange(index,"bullets",item.bullets.filter((_,i)=>i!==bulletIndex))}>×</button></label>)}<button className="add-entry" type="button" onClick={()=>itemChange(index,"bullets",[...(item.bullets||[]),""])}>＋ Bullet point</button></div></fieldset>)}<button className="add-entry" type="button" onClick={addExperience}>＋ Add Work Experience</button><datalist id="company-options">{COMPANY_OPTIONS.map(option=><option key={option} value={option}/>)}</datalist></>}

                {section === "skills" && <div className="skill-editor">{draft.map((skill,index)=><span key={`${skill}-${index}`}>{skill}<button type="button" onClick={()=>removeItem(index)}>×</button></span>)}<input maxLength={200} placeholder="Add skill…" onKeyDown={event=>{if(event.key === "Enter" && event.currentTarget.value.trim()){event.preventDefault();setDraft(current=>[...current,event.currentTarget.value.trim()]);event.currentTarget.value="";}}}/></div>}
                {section === "preferences" && draft.map(([question,answer],index)=><Field key={question} label={question} value={answer} onChange={next=>rowChange(index,next)} type={question.includes("date") ? "date" : "text"}/>)}
                {section === "equalEmployment" && <div className="eeo-editor">{draft.map(([question,answer],index)=><SelectField key={question} label={question} value={answer} onChange={next=>rowChange(index,next)} options={EEO_OPTIONS[question] || [answer,"Choose not to disclose"]} required/>)}</div>}
                <datalist id="location-options">{LOCATION_OPTIONS.map(option=><option key={option} value={option}/>)}</datalist>
            </div>
            <footer><button className="secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" type="button" onClick={() => onSave(draft)} disabled={saving}>{saving ? "Updating…" : "Update"}</button></footer>
        </aside>
    </div>;
};

export default ProfileEditor;
