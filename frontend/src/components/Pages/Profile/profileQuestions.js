export const INTERVIEW_LANGUAGE = 'Preferred programming language for interviews';
export const ACTIVE_IMMIGRATION_CASE = 'Currently have an active immigration case (e.g. H-1B extension or green card)';
export const INTERVIEW_LANGUAGES = ['Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C', 'C#', 'Go', 'Rust', 'Ruby', 'Swift', 'Kotlin'];

// Add new questions to older saved profiles without replacing their answers.
export const withApplicationQuestions = (section, value) => {
    const label = section === 'preferences' ? INTERVIEW_LANGUAGE : section === 'equalEmployment' ? ACTIVE_IMMIGRATION_CASE : null;
    const rows = Array.isArray(value) ? value : [];
    return !label || rows.some(row => String(row[0]).toLowerCase() === label.toLowerCase()) ? rows : [...rows, [label, '']];
};
