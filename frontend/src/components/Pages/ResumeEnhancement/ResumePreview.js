import React from 'react';
const heading=/^(summary|profile|professional summary|(?:work |professional |relevant )?experience|employment|education|(?:technical |core )?skills|projects|certifications|awards|publications|volunteer experience)\s*:?$/i;
export default function ResumePreview({text,changes=[]}){
    const changed=new Set(changes.flatMap(change=>change.replacement.split('\n').map(line=>line.trim())).filter(Boolean));
    let first=true;let inHeader=true;
    return <article className="resume-paper" aria-label="Resume preview">{text.replace(/\r/g,'').split('\n').map((line,index)=>{
        const value=line.trim();
        if(!value)return <div className="resume-paper-space" key={index}/>;
        if(first){first=false;return <h1 key={index}>{value}</h1>;}
        if(heading.test(value)){inHeader=false;return <h2 key={index}>{value.replace(/:$/,'')}</h2>;}
        const bullet=/^[•●▪*-]\s+/.test(value);
        const isContact=inHeader&&(/@|https?:|linkedin|github|\d{3}[-.)\s]/i.test(value));
        return <p className={`${bullet?'resume-paper-bullet':''} ${isContact?'resume-paper-contact':''}`} key={index}>{changed.has(value)?<mark>{value}</mark>:value}</p>;
    })}</article>;
}
