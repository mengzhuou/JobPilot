import React, {useEffect, useState} from 'react';
import {profileStrength} from './profileCompleteness';
export default function ProfileStrength({profile,hasResume,loaded,onEdit,onResumes}) {
    const {items,score}=profileStrength(profile,hasResume);
    const available=loaded && score!==null;
    const complete=available && score===100;
    const [expanded,setExpanded]=useState(!complete);
    useEffect(()=>setExpanded(!complete),[complete]);
    return <aside className="profile-strength" aria-label="My profile strength"><span className="strength-eyebrow">MY PROFILE STRENGTH</span><h2>{complete ? 'Ready for applications' : 'Build your application profile'}</h2><p>{complete ? 'Profile complete! Your saved details are ready for Autofill.' : 'Save your details once to make future applications easier.'}</p>
        {available ? <><div className="strength-meter"><progress value={score} max="100" aria-label="Profile completeness"/><strong>{score}%</strong></div><span className="strength-count">{items.filter(item=>item.complete).length} of {items.length} core sections complete</span></> : <p role="status">Profile strength is unavailable until your saved Profile and résumé information load.</p>}
        <button className="strength-toggle" type="button" aria-expanded={expanded} aria-controls="profile-strength-checklist" onClick={()=>setExpanded(value=>!value)}>{expanded ? 'Hide checklist' : complete ? 'View completed sections' : 'View checklist'} <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button>
        <div id="profile-strength-checklist" hidden={!expanded}><ul>{items.map(item=><li key={item.label}><button type="button" disabled={!loaded} onClick={()=>item.section==='resumes'?onResumes():onEdit(item.section)}><span className={loaded && item.complete ? 'strength-done' : ''}>{loaded && item.complete ? '✓' : '○'}</span><span>{item.label}</span><small>{loaded && item.complete ? 'Complete' : `+${item.weight}%`}</small></button></li>)}</ul>
        <button className="strength-optional" type="button" disabled={!loaded} onClick={()=>onEdit('equalEmployment')}>Edit optional employment answers →</button><p className="strength-note">Optional employment and demographic answers never affect your score. This measures completeness, not job eligibility.</p>
        </div>
    </aside>;
}
