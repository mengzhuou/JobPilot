import React from 'react';
import OrganizationBadge from './OrganizationBadge';
import {formatProfileMonth} from './profileDates';

export default function ProfileHistory({items=[],kind}) {
    const education=kind==='education';
    return <div className="profile-history">{items.map((item,index)=>{
        const organization=education ? item.school : item.company;
        const dates=[formatProfileMonth(item.from),formatProfileMonth(item.current ? 'Present' : item.to)].filter(Boolean).join(' – ');
        const degree=[item.degree,item.fieldOfStudy && !String(item.degree || '').toLowerCase().includes(item.fieldOfStudy.toLowerCase()) ? item.fieldOfStudy : ''].filter(Boolean).join(' · ');
        const legacyGpa=(item.details || []).find(detail=>/^GPA\s/i.test(detail));
        const gpa=item.gpa !== undefined ? (String(item.gpa).trim() ? `GPA: ${item.gpa}` : '') : legacyGpa?.replace(/^GPA\s*/i,'GPA: ');
        const chips=[dates,education ? degree : item.jobType,education ? gpa : '',item.location].filter(Boolean);
        return <article className={`profile-history-entry ${kind}`} key={`${organization}-${item.from}-${index}`}>
            <OrganizationBadge name={organization} kind={education ? 'school' : 'company'} logoUrl={item.logoUrl}/>
            <div className="profile-history-body">
                <h3>{education ? organization : item.title || organization}</h3>
                {!education && item.title && <p className="profile-history-organization">{organization}</p>}
                {chips.length>0 && <ul className="profile-history-meta" aria-label="Entry details">{chips.map((chip,i)=><li key={i}>{chip}</li>)}</ul>}
                {item.summary && <p className="profile-history-summary">{item.summary}</p>}
                {(item.details || []).filter(detail=>!/^GPA\s/i.test(detail)).map((detail,i)=><p className="profile-history-summary" key={i}>{detail}</p>)}
                {item.bullets?.length>0 && <ul className="profile-history-bullets">{item.bullets.filter(Boolean).map((bullet,i)=><li key={i}>{bullet}</li>)}</ul>}
            </div>
        </article>;
    })}</div>;
}
