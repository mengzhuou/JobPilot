const {createHash}=require('node:crypto');
const {CATALOG,aliasesFor}=require('./skillAliases');
const {cleanSkill}=require('./skillLabelQuality');
const VERSION='open-vocabulary-v2-quality';
const plain=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9+#.]+/g,' ').replace(/\.(?=\s|$)/g,'').trim();
const hasPhrase=(text,phrase)=>Boolean(plain(phrase))&&(' '+plain(text)+' ').includes(' '+plain(phrase)+' ');
const strings=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'):typeof value==='string'?[value]:[];
const containsSkill=(text,skill)=>{
    const label=typeof skill==='string'?skill:skill.label;
    return [label,...aliasesFor(label),...strings(skill.aliases)].some(alias=>hasPhrase(text,alias));
};
const jobText=job=>[job.title,...strings(job.tags),job.description,job.summary,...strings(job.requirements),...strings(job.responsibilities)].filter(Boolean).join('\n')
    .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').slice(0,40000);
const fingerprint=job=>createHash('sha256').update(VERSION+'\n'+String(job.company||'')+'\n'+jobText(job)).digest('hex');
const key=label=>plain(label).replace(/\b([a-z]{2,})s\b/g,'$1');
const priority={required:0,preferred:1,mentioned:2};
const mergeSkills=skills=>{
    const result=new Map();
    for(const skill of skills){const old=result.get(key(skill.label));if(!old||priority[skill.category]<priority[old.category])result.set(key(skill.label),skill);}
    return [...result.values()].sort((a,b)=>priority[a.category]-priority[b.category]).slice(0,80);
};
const ignored=/^(?:US|USA|EEO|EEOC|EOE|ADA|USD|FAQ|CEO|CTO|PhD|BS|MS|IT|OR|AND|THE|FOR|WITH|FROM|TO|IN|AT|IS|AS|ON|OF)$/;
// Existing aliases normalize spelling; they are not an allowlist. Generic term
// shapes and skill clauses admit new concepts without adding application code.
const localSkills=job=>{
    const found=[];let section='mentioned';
    const text=jobText(job).replace(/\b(required qualifications|preferred qualifications|requirements|qualifications|responsibilities|benefits|about us)\s*:/gi,'\n$&\n');
    for(const raw of text.split(/\n+|;\s*|(?<=[!?])\s+/)){
        const line=raw.replace(/^\s*[-•*]+\s*/,'').trim();if(!line)continue;
        const heading=line.replace(/:$/,'');
        if(/^(preferred|preferred qualifications|nice[- ]to[- ]haves?|bonus points|desired qualifications|preferred skills)$/i.test(heading)){section='preferred';continue;}
        if(/^(required|minimum qualifications|basic qualifications|required qualifications|what you bring|what you need|requirements|required skills|qualifications)$/i.test(heading)){section='required';continue;}
        if(/^(benefits|equal opportunity|compensation|about us|about the company|salary|what we offer)$/i.test(heading)){section='excluded';continue;}
        if(/^(responsibilities|what you will do|about the role)$/i.test(heading)){section='mentioned';continue;}
        if(section==='excluded'||/equal opportunity|without regard to|reasonable accommodation|pay range|salary range/i.test(line))continue;
        const category=/\b(preferred|nice to have|bonus|a plus|ideally|desirable|welcome)\b/i.test(line)?'preferred':/\b(must|required|requires|minimum|essential)\b/i.test(line)?'required':section;
        const add=(label,aliases=[])=>{const skill=cleanSkill({label,aliases,category,evidence:line.slice(0,600)},job);if(skill)found.push(skill);};
        const known=CATALOG.filter(([label,aliases])=>aliases.some(alias=>hasPhrase(line,alias)) && !(label==='Go'&&!/\b(?:Golang|Go language|Go programming)\b/.test(line)));
        known.forEach(([label,aliases])=>{if(label==='Communication'&&/compute\s*[/ -]\s*communication|communication overlapping/i.test(line))return;add(label,aliases);});
        const canonical=term=>known.some(([,aliases])=>aliases.some(alias=>plain(alias)===plain(term)));
        const terms=line.match(/\b(?:[A-Z]{2,}[0-9]*(?:s)?|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*)+|[A-Za-z]+\.[A-Za-z]+)\b/g)||[];
        for(const term of terms)if(!ignored.test(term)&&! /^(?:e\.g|i\.e|etc|U\.S)$/i.test(term)&&!canonical(term))add(term,[term.replace(/s$/,'')]);
        const clause=/\b(?:experience|proficiency|proficient|familiarity|knowledge|expertise|understanding)\s+(?:with|in|of)\s+(.+)/i.exec(line)?.[1];
        if(clause)for(let term of clause.split(/,|\s+(?:and|or)\s+/)){
            term=term.replace(/^(?:optimizing|using|developing|building|strong|hands-on)\s+/i,'').replace(/\s+(?:for|to|that|which|at|in)\s+.*$/i,'').replace(/[.()]+$/,'').trim();
            if(term.split(/\s+/).length<=5&&term.length>1&&!/\b(years?|experience|degree|bachelor|master|you|our|their|related|ability)\b/i.test(term)&&!canonical(term))add(term);
        }
    }
    return mergeSkills(found);
};
const extractJobSkills=job=>job.skillExtraction?.key===fingerprint(job)&&Array.isArray(job.skillExtraction.skills)?mergeSkills(job.skillExtraction.skills.map(skill=>cleanSkill(skill,job)).filter(Boolean)):localSkills(job);
// Every accepted concept must be grounded in a literal span of this job.
const validateSkills=(input,text,job={})=>{
    if(!Array.isArray(input)||input.length>80)throw new Error('Invalid skill extraction');
    return mergeSkills(input.filter(skill=>skill&&typeof skill.label==='string'&&skill.label.trim().length>0&&skill.label.length<=65&&
        priority[skill.category]!==undefined&&typeof skill.evidence==='string'&&skill.evidence.length>=3&&skill.evidence.length<=600&&
        plain(text).includes(plain(skill.evidence))&&[skill.label,...strings(skill.aliases)].some(term=>hasPhrase(skill.evidence,term)))
        .map(skill=>cleanSkill({...skill,label:skill.label.trim(),aliases:strings(skill.aliases).filter(alias=>alias.length>0&&alias.length<=65).slice(0,8)},job)).filter(Boolean));
};
module.exports={VERSION,jobText,fingerprint,extractJobSkills,localSkills,containsSkill,hasPhrase,validateSkills};
