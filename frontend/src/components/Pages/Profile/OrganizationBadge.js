import React, {useState} from 'react';

// Exact aliases only: never guess a domain from a person's education/employer.
const domains = {
    'georgia institute of technology':'gatech.edu', 'georgia tech':'gatech.edu',
    'georgia southern university':'georgiasouthern.edu',
    'georgia state university':'gsu.edu', 'university of georgia':'uga.edu',
    'stanford university':'stanford.edu', 'massachusetts institute of technology':'mit.edu',
    'harvard university':'harvard.edu', 'carnegie mellon university':'cmu.edu',
    'university of texas at austin':'utexas.edu', 'university of texas at dallas':'utdallas.edu',
    'walmart':'walmart.com', 'walmart global tech':'walmart.com',
    'google':'google.com', 'microsoft':'microsoft.com', 'amazon':'amazon.com',
    'apple':'apple.com', 'meta':'meta.com', 'openai':'openai.com',
    'travelers':'travelers.com', 'messagegears':'messagegears.com',
};
export const organizationLogo = (name, logoUrl) => {
    if (typeof logoUrl === 'string' && /^https:\/\//i.test(logoUrl)) return logoUrl;
    const domain=domains[String(name || '').trim().toLowerCase().replace(/\s+/g,' ')];
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : '';
};
export default function OrganizationBadge({name,kind,logoUrl}) {
    const src=organizationLogo(name,logoUrl);
    const [failed,setFailed]=useState('');
    const initials=String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase() || (kind==='school'?'ED':'CO');
    return <div className={`profile-organization-badge ${kind} ${src && failed!==src ? 'has-logo' : 'is-placeholder'}`} aria-hidden="true">
        {src && failed!==src
            ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>
            : <span>{initials}</span>}
    </div>;
}
