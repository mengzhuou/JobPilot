import React, { useCallback, useEffect, useState } from "react";
import { deleteFeedback, getFeedback, updateFeedback } from "../../../connector";
import "./ManagementPages.scss";

const AdminFeedback = () => {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        try { setItems(await getFeedback()); }
        catch (requestError) { setError(requestError.response?.data?.message || requestError.message); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    const setStatus = async (item, status) => {
        await updateFeedback(item.id, { status, adminNote: item.admin_note });
        await load();
    };
    const remove = async item => {
        if (!window.confirm(`Delete feedback “${item.subject}”?`)) return;
        await deleteFeedback(item.id);
        setItems(current => current.filter(feedback => feedback.id !== item.id));
    };
    return <main className="management-page"><div className="management-shell">
        <header className="management-heading"><h1>Feedback Inbox</h1><p>Review user feedback and close out resolved requests.</p></header>
        {error && <p className="management-error">{error}</p>}
        <section className="management-list feedback-list">{items.length ? items.map(item => <article className="management-item feedback-item" key={item.id}>
            <div className="feedback-copy"><div className={`feedback-state ${item.status}`}><span className="feedback-dot" aria-hidden="true" />{item.status === "resolved" ? "Resolved" : item.status === "unread" ? "Unread" : "Read"}</div><h2>{item.subject}</h2><p className="feedback-message">{item.message}</p><p className="feedback-author">{item.email}</p></div>
            <div className="management-actions">{item.status === "unread" && <button onClick={() => setStatus(item, "read")}>Mark read</button>}{item.status !== "resolved" && <button className="primary" onClick={() => setStatus(item, "resolved")}>Resolve</button>}<button className="danger" onClick={() => remove(item)}>Delete</button></div>
        </article>) : <div className="management-panel">No feedback has been submitted yet.</div>}</section>
    </div></main>;
};

export default AdminFeedback;
