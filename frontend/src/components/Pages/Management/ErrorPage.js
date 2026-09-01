import React from "react";
import { Link } from "react-router-dom";
import "./ManagementPages.scss";

const COPY={
  403:{title:"Access denied",message:"You do not have permission to open this page."},
  404:{title:"Page not found",message:"The page may have moved, expired, or never existed."},
  500:{title:"Something went wrong",message:"JobPilot could not complete this request. Please try again."},
};
const ErrorPage=({status=500})=>{const content=COPY[status]||COPY[500];return <main className="management-page"><section className="management-shell management-panel error-page"><span>{status}</span><h1>{content.title}</h1><p>{content.message}</p><Link className="management-button" to="/active-job-postings">Return to job listings</Link></section></main>;};
export default ErrorPage;
