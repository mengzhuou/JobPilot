import React, { useEffect, useState } from "react";
import { getJobMarketAnalytics, refreshJobMarketAnalytics } from "../../../connector";
import "./AdminAnalytics.scss";

const COLORS = ["#3361ae", "#18a67a", "#8b5ec7", "#df8d2c", "#d64f5f", "#2b94a8", "#6f7f98", "#b56a9d", "#7ea23a", "#b7bfcc"];
const formatDate = value => value ? new Intl.DateTimeFormat("en-US", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "Not generated yet";
const getChartBackground = categories => {
    let start = 0;
    const segments = (categories || []).map((category,index) => {
        const end = start + Number(category.percentage || 0);
        const segment = `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
        start = end;
        return segment;
    });
    return segments.length ? `conic-gradient(${segments.join(",")})` : "#e6ebf2";
};

const DistributionChart = ({ title, description, categories, total }) => <section className="analytics-chart-card">
    <div className="market-pie" style={{background:getChartBackground(categories)}} role="img" aria-label={`Pie chart showing ${title.toLowerCase()}`}><div><strong>{Number(total || 0).toLocaleString()}</strong><span>jobs</span></div></div>
    <div className="analytics-legend"><h2>{title}</h2><p>{description}</p>{(categories || []).map((category,index)=><div className="analytics-legend-row" key={category.name}><i style={{background:COLORS[index % COLORS.length]}}/><span>{category.name}</span><strong>{category.percentage}%</strong><small>{Number(category.count).toLocaleString()} jobs</small></div>)}</div>
</section>;

const AdminAnalytics = () => {
    const [snapshot,setSnapshot] = useState(null);
    const [loading,setLoading] = useState(true);
    const [refreshing,setRefreshing] = useState(false);
    const [error,setError] = useState("");
    useEffect(() => { getJobMarketAnalytics().then(setSnapshot).catch(requestError => setError(requestError.response?.data?.message || requestError.message)).finally(() => setLoading(false)); }, []);
    const refresh = async () => { setRefreshing(true);setError("");try{setSnapshot(await refreshJobMarketAnalytics());}catch(requestError){setError(requestError.response?.data?.message || requestError.message);}finally{setRefreshing(false);} };

    return <main className="analytics-page"><div className="analytics-shell">
        <header className="analytics-heading"><div><span>Market intelligence</span><h1>Job market analytics</h1><p>A stored snapshot of every job in the completed company-source catalog.</p></div><button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? "Updating all sources…" : "Refresh All Charts"}</button></header>
        {error && <div className="analytics-error" role="alert">{error}</div>}
        {loading ? <section className="analytics-empty">Loading stored analytics…</section> : !snapshot ? <section className="analytics-empty"><h2>No market snapshot yet</h2><p>Click Refresh All Charts to update every source, calculate all distributions, and save them to the database.</p></section> : <>
            <section className="analytics-summary"><article><span>Jobs analyzed</span><strong>{Number(snapshot.total_jobs).toLocaleString()}</strong></article><article><span>Job categories</span><strong>{snapshot.categories?.length || 0}</strong></article><article><span>Snapshot generated</span><strong>{formatDate(snapshot.generated_at)}</strong></article></section>
            <div className="analytics-charts">
                <DistributionChart title="Job category distribution" description="The technical specialization represented by each listing." categories={snapshot.categories} total={snapshot.total_jobs}/>
                <DistributionChart title="Application platform distribution" description="Where the collected job application is hosted." categories={snapshot.platform_categories} total={snapshot.total_jobs}/>
                <DistributionChart title="Software engineering level distribution" description="Seniority inferred case-insensitively from titles and acronyms such as Sr., NG, I, II, and III." categories={snapshot.level_categories} total={snapshot.total_jobs}/>
            </div>
            <p className="analytics-footnote">Source catalog completed {formatDate(snapshot.source_fetched_at)}. These charts remain unchanged until an administrator refreshes them.</p>
        </>}
    </div></main>;
};

export default AdminAnalytics;
