import React, { useEffect, useState, useId } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { getProfileLocations } from '../../../connector';

export const TECH_SKILLS = ['Python','Java','JavaScript','TypeScript','C','C++','C#','Go','Rust','Ruby','PHP','Swift','Kotlin','Scala','R','SQL','HTML','CSS','React','React Native','Angular','Vue.js','Next.js','Redux','Node.js','Express.js','Spring Boot','Django','Flask','FastAPI','.NET','GraphQL','REST APIs','PostgreSQL','MySQL','MongoDB','Redis','DynamoDB','Elasticsearch','Snowflake','Databricks','Apache Spark','Kafka','Airflow','AWS','Azure','Google Cloud','Docker','Kubernetes','Terraform','Linux','Git','GitHub Actions','Jenkins','CI/CD','Playwright','Selenium','Jest','PyTest','JUnit','Machine Learning','Deep Learning','PyTorch','TensorFlow','scikit-learn','Pandas','NumPy','LLMs','NLP','Computer Vision','Figma','Agile','Scrum'];
export const OFFICE_OPTIONS = ['Remote only','1 day per week','2-4 days per week','5 days per week','Flexible'];
export const SEEKING_OPTIONS = ['Internship','Full-time','Co-op'];
export const asSelections = (value, seeking = false) => {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return [...new Set(values.flatMap(item => seeking ? ({ 'Full-time roles':['Full-time'], 'Internship or co-op roles':['Internship','Co-op'] }[item] || [item]) : [item]))];
};

export function SuggestField({ label, value, onChange, options = [], multiple = false, required = false, kind, country = '', state = '', disabled = false, helperText, freeSolo = true }) {
    const inputId = useId();
    const [query, setQuery] = useState('');
    const [remote, setRemote] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!kind || disabled) { setRemote([]); setLoading(false); return undefined; }
        let active = true;
        setRemote([]); setLoading(false); setError('');
        const timer = setTimeout(() => {
            setLoading(true); setError('');
            getProfileLocations({ kind, q: query, country, state }).then(items => { if (active) setRemote(items); })
                .catch(() => { if (active) setError('Suggestions unavailable. You can still enter a value.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 200);
        return () => { active = false; clearTimeout(timer); };
    }, [kind, query, country, state, disabled]);
    return <div className="profile-suggest-field"><label htmlFor={inputId}>{required && <b>*</b>}{label}</label><Autocomplete id={inputId} className="profile-suggest" multiple={multiple} freeSolo={freeSolo} disablePortal
        disabled={disabled} options={kind ? remote : options} value={multiple ? asSelections(value) : value || ''}
        loading={loading} filterSelectedOptions size="small" filterOptions={kind ? items => items : undefined}
        onInputChange={(_, next, reason) => {
            if (reason === 'input' || reason === 'clear') { setQuery(next); if (!multiple) onChange(next); }
        }}
        onChange={(_, next) => {
            onChange(multiple ? [...new Set(next.map(v => v.trim()).filter(Boolean))] : next || '');
            setQuery('');
        }}
        renderInput={params => <TextField {...params} required={required && (!multiple || !value?.length)}
            helperText={error || helperText} inputProps={{ ...params.inputProps, maxLength: 199, pattern: required ? '.*\\S.*' : undefined }} />}
    /></div>;
}

export function PersonalLocations({ draft, setDraft }) {
    const [postcodes, setPostcodes] = useState([]);
    const [postalMessage, setPostalMessage] = useState('');
    const { country = '', state = '', city = '' } = draft;
    useEffect(() => {
        let active = true;
        setPostcodes([]);
        if (!country || !state || !city) { setPostalMessage('Enter country, state and city for postal-code suggestions.'); return undefined; }
        const timer = setTimeout(() => {
            getProfileLocations({ kind:'postal', country, state, city }).then(codes => {
                if (!active) return;
                setPostcodes(codes);
                setPostalMessage(codes.length > 1 ? 'This city has multiple ZIP codes. Choose the one for your address.' : codes.length === 1 ? 'Suggested from your city and state; please verify your address.' : 'No exact postal suggestion available. Enter your postal code.');
                if (codes.length === 1) setDraft(current => current.postalCode ? current : { ...current, postalCode:codes[0] });
            }).catch(() => { if (active) setPostalMessage('Postal suggestions unavailable. Enter your postal code.'); });
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [country, state, city, setDraft]);
    return <>
        <div className="editor-grid three">
            <SuggestField label="Country/Region" value={country} kind="countries" required
                onChange={country => setDraft(current => current.country === country ? current : ({ ...current, country, state:'', city:'', postalCode:'' }))} />
            <SuggestField label="State" value={state} kind="states" country={country} disabled={!country} required
                onChange={state => setDraft(current => current.state === state ? current : ({ ...current, state, city:'', postalCode:'' }))} />
            <SuggestField label="City" value={city} kind="cities" country={country} state={state} disabled={!country || !state} required
                onChange={city => setDraft(current => current.city === city ? current : ({ ...current, city, postalCode:'' }))} />
        </div>
        <SuggestField label="Postal Code" value={draft.postalCode || ''} options={postcodes} required helperText={postalMessage}
            onChange={postalCode => setDraft(current => ({ ...current, postalCode }))} />
    </>;
}
