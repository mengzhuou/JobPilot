import React,{useEffect,useState} from "react";
import {deleteJobPreference,getJobPreferences} from "../../../connector";
import "./ManagementPages.css";
const JobPreferences=({state})=>{const[jobs,setJobs]=useState([]);const[error,setError]=useState("");
useEffect(()=>{getJobPreferences(state).then(setJobs).catch(e=>setError(e.response?.data?.message||e.message));},[state]);
const remove=async id=>{await deleteJobPreference(id);setJobs(current=>current.filter(job=>job.id!==id));};
return <main className="management-page"><div className="management-shell"><header className="management-heading"><h1>{state==="saved"?"Saved Jobs":"Blocked Jobs"}</h1><p>{state==="saved"?"Roles you want to revisit before applying.":"Jobs hidden from your active listings."}</p></header>{error&&<p>{error}</p>}<section className="management-list">{jobs.length?jobs.map(job=><article className="management-item" key={job.id}><div><h2>{job.job_title||"Job posting"}</h2><p>{job.company}{job.location?` · ${job.location}`:""}</p></div><div className="management-actions"><a className="management-action-link" href={job.job_url} target="_blank" rel="noreferrer">View job</a><button onClick={()=>remove(job.id)}>{state==="blocked"?"Unblock":"Remove"}</button></div></article>):<div className="management-panel">No {state} jobs yet.</div>}</section></div></main>};
export default JobPreferences;
