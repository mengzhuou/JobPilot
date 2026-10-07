// Quality checks, not a skill vocabulary: unfamiliar technical names remain valid.
const {CATALOG}=require('./skillAliases');
const careerSources=require('./companyCareerSources');
const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9+#]+/g,' ').trim();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const compact=value=>key(value).replace(/\s+/g,'');
const employerNames=new Set(careerSources.map(source=>compact(source.company)).filter(Boolean));
const knownEmployer=label=>{
    const value=compact(label);
    if(employerNames.has(value))return true;
    // Career-page headings can concatenate adjacent brands, including shared
    // boundary letters (SpaceX + xAI -> SpaceXAI). Never use substring matching
    // alone: OpenAI API and other vendor-qualified tools must remain eligible.
    return [...employerNames].some(name=>name.length>=3&&value.startsWith(name)&&
        (employerNames.has(value.slice(name.length))||employerNames.has(value.slice(name.length-1))));
};
const generic=/^(?:design|architecture|development|developing|building|using|working|optimizing|scalable|modern|particularly|including|experience|knowledge|understanding|proficiency|familiarity|ability|skills?|systems?|tools?|technologies|platforms?|solutions?|applications?|software|hardware|ID|IDs)$/i;
const normalizeSkillLabel=value=>{
    let label=String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    // Remove sentence/list introductions without changing the technical noun phrase.
    label=label.replace(/^(?:(?:particularly|especially|including|such as|e\.g\.?|i\.e\.?)\s*[, :]\s*|(?:particularly|especially|the|a|an)\s+)/i,'').trim();
    if(!label||label.length>65||generic.test(label))return '';
    if(/^(?:#?LI(?:[-_].*)?|#?DNI|#?LI[-_]DNI)$/i.test(label))return '';
    if(/^(?:e\.?g\.?|i\.?e\.?|etc\.?|U\.S\.?)$/i.test(label))return '';
    // Glued sentence boundaries are not package names; Node.js and ASP.NET survive.
    if(/[a-z]{2,}\.[A-Z][a-z]{2,}/.test(label))return '';
    if(/[!?;:]|[()]/.test(label)||/\b(?:you|your|our|their|we|they|this|these|those)\b/i.test(label))return '';
    if(/\b(?:of|for|with|and|or|to|in|a|an|the|modern|new|novel|scalable|particularly|including)$/i.test(label))return '';
    if(label.split(' ').length>6)return '';
    return label;
};
const isOrganization=(label,job,evidence)=>{
    const company=String(job?.company||'').replace(/\b(?:incorporated|inc|llc|ltd|corporation|corp)\.?$/i,'').trim();
    const sameCompany=company&&compact(label)===compact(company);
    const listedEmployer=knownEmployer(label);
    const name=escape(label);
    const text=[job?.description,job?.summary,...(Array.isArray(job?.requirements)?job.requirements:[]),evidence].filter(Boolean).join('\n');
    // Employer/entity context, not blanket rejection of vendor-branded technology.
    const entityContext=new RegExp(`\\b${name}[’']s\\b|\\b(?:join|work at|working at|employed by|about)\\s+${name}(?=[\\s.,!]|$)`,'i').test(text);
    if(!sameCompany&&!entityContext&&!listedEmployer)return false;
    const technologyUse=new RegExp(`\\b(?:using|use|proficien(?:t|cy) in|experience (?:with|in)|knowledge of)\\s+${name}(?=[\\s.,;)]|$)`,'i').test(evidence||'');
    // MongoDB can be both employer and database; an actual technology-use clause
    // permits it. Merely being a named employer does not create a skill.
    const recognizedTechnology=CATALOG.some(([name,aliases])=>[name,...aliases].some(alias=>key(alias)===key(label)));
    return !(recognizedTechnology&&(technologyUse||(!sameCompany&&!entityContext)));
};
const cleanSkill=(skill,job={})=>{
    const label=normalizeSkillLabel(skill?.label);
    if(!label||isOrganization(label,job,skill.evidence))return null;
    return {...skill,label};
};
module.exports={normalizeSkillLabel,cleanSkill};
