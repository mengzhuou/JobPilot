import React, { useState } from "react";
import { submitFeedback } from "../../../connector";
import "./ManagementPages.scss";

const Feedback = () => {
    const [data, setData] = useState({ subject: "", message: "" });
    const [notice, setNotice] = useState("");
    const submit = async event => {
        event.preventDefault();
        try {
            await submitFeedback(data);
            setData({ subject: "", message: "" });
            setNotice("Thank you. Your feedback was sent to the JobPilot administrators.");
        } catch (error) {
            setNotice(error.response?.data?.message || error.message);
        }
    };
    return <main className="management-page"><div className="management-shell">
        <header className="management-heading"><h1>Send Feedback</h1><p>Share an idea, report a problem, or tell us what would make JobPilot better.</p></header>
        <section className="management-panel"><form className="management-form" onSubmit={submit}>
            <label className="full">Subject<input value={data.subject} onChange={event => setData({ ...data, subject: event.target.value })} required /></label>
            <label className="full">Feedback<textarea value={data.message} onChange={event => setData({ ...data, message: event.target.value })} required /></label>
            <button>Send feedback</button>
        </form>{notice && <p className="management-message">{notice}</p>}</section>
    </div></main>;
};

export default Feedback;
