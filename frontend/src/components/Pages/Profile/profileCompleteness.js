const present = value => String(value || '').trim().length > 0;
const any = value => Array.isArray(value) ? value.some(present) : present(value);
export const profileStrength = (profile, hasResume) => {
    const p=profile.personal||{}, preferences=profile.preferences||[];
    const items=[
        {section:'personal',label:'Add your contact information',weight:20,complete:['firstName','lastName','email','phone','city','country'].every(key=>present(p[key]))},
        {section:'education',label:'Add your education',weight:20,complete:(profile.education||[]).some(row=>present(row.school)&&present(row.degree))},
        {section:'experience',label:'Add your work experience',weight:15,complete:(profile.experience||[]).some(row=>present(row.company)&&present(row.title))},
        {section:'resumes',label:'Choose your primary résumé',weight:15,complete:hasResume===null?null:Boolean(hasResume)},
        {section:'personal',label:'Add your professional links',weight:10,complete:(p.links||[]).some(row=>/^https?:\/\//.test(row.href||''))},
        {section:'skills',label:'Add your skills',weight:10,complete:(profile.skills||[]).length>0},
        {section:'preferences',label:'Set your job preferences',weight:10,complete:preferences.some(([label,value])=>/^seeking$/i.test(label)&&any(value)) && preferences.some(([label,value])=>/location|office preference/i.test(label)&&any(value))},
    ];
    return {items,score:items.some(item=>item.complete===null)?null:items.reduce((sum,item)=>sum+(item.complete?item.weight:0),0)};
};
