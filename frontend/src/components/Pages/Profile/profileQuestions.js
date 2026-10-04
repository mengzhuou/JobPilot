export const INTERVIEW_LANGUAGE = 'Preferred programming language for interviews';
export const ACTIVE_IMMIGRATION_CASE = 'Currently have an active immigration case (e.g. H-1B extension or green card)';
export const ACTIVE_SECURITY_CLEARANCE = 'Do You Currently Hold an Active Security Clearance?';
export const OTHER_CITIZENSHIP = 'Are you a citizen of any country other than the United States (e.g., dual citizen)?';
export const INTERVIEW_LANGUAGES = ['Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C', 'C#', 'Go', 'Rust', 'Ruby', 'Swift', 'Kotlin'];

export const PREFERRED_LOCATION = 'Preferred application location';
export const normalizePreferredLocations = rows => {
    const isLocation=row=>['preferred application location','preferred locations'].includes(String(row?.[0]||'').trim().toLowerCase());
    const locations=rows.filter(isLocation);
    if(!locations.length)return rows;
    const seen=new Set();
    const values=locations.flatMap(row=>Array.isArray(row[1])?row[1]:[row[1]]).filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()).filter(value=>{
        const key=value.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;
    });
    let added=false;
    return rows.flatMap(row=>{
        if(!isLocation(row))return [row];
        if(added)return [];added=true;
        return [[PREFERRED_LOCATION,values]];
    });
};

// Add new questions to older saved profiles without replacing their answers.
export const withApplicationQuestions = (section, value) => {
    const labels = section === 'preferences' ? [INTERVIEW_LANGUAGE] : section === 'equalEmployment' ? [ACTIVE_IMMIGRATION_CASE, ACTIVE_SECURITY_CLEARANCE, OTHER_CITIZENSHIP] : [];
    const raw = Array.isArray(value) ? value : [];
    const rows = section==='preferences'?normalizePreferredLocations(raw):raw;
    return [...rows, ...labels.filter(label=>!rows.some(row => String(row[0]).toLowerCase() === label.toLowerCase())).map(label=>[label,''])];
};
