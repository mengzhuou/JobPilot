import React,{useCallback,useEffect,useState} from "react";
import {addCareerSource,getCareerSources} from "../../../connector";
import "./ManagementPages.css";
const AdminCompanies=()=>{const[sources,setSources]=useState([]);const[input,setInput]=useState("");const[message,setMessage]=useState("");
const load=useCallback(()=>getCareerSources().then(setSources).catch(e=>setMessage(e.response?.data?.message||e.message)),[]);
useEffect(()=>{void load();},[load]);
const submit=async e=>{e.preventDefault();try{const source=await addCareerSource(input);setMessage(`${source.company} added to JobPilot.`);setInput("");load();}catch(err){setMessage(err.response?.data?.message||err.message);}};
return <main className="management-page"><div className="management-shell"><header className="management-heading"><h1>Company Sources</h1><p>Administrator-only management for official career sites.</p></header><section className="management-panel"><form className="management-form" onSubmit={submit}><label className="full">Company name or careers URL<input value={input} onChange={e=>setInput(e.target.value)} placeholder="Google or https://jobs.company.com" required/></label><button type="submit">Add company source</button></form>{message&&<p className="management-message">{message}</p>}<div className="source-grid">{sources.map((source,index)=><div className="source-chip" key={`${source.company}-${index}`}><strong>{source.company}</strong><span>{source.provider} · {source.type}</span></div>)}</div></section></div></main>};
export default AdminCompanies;
