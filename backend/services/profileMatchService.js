const STOP_WORDS = new Set([
    "and", "the", "for", "with", "from", "that", "this", "your", "you", "our", "are", "will", "have", "has",
    "job", "role", "work", "team", "years", "year", "experience", "engineer", "engineering", "software", "developer",
    "development", "full", "time", "required", "preferred", "ability", "including", "about", "into", "using", "new",
]);

const plain = value => String(value || "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
const words = value => new Set(plain(value).split(/\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word)));
const values = value => Array.isArray(value) ? value.flatMap(values) : value && typeof value === "object" ? Object.values(value).flatMap(values) : value ? [String(value)] : [];
const hasPhrase = (text, phrase) => {
    const normalized = plain(phrase);
    return normalized.length > 1 && (` ${plain(text)} `).includes(` ${normalized} `);
};

const preferenceValue = (profile, matcher) => (profile.preferences || [])
    .filter(row => Array.isArray(row) && matcher.test(String(row[0] || "")))
    .flatMap(row => values(row[1]));

const jobText = job => [job.title, job.company, job.location, ...(job.tags || []), job.summary, ...(job.requirements || [])]
    .filter(Boolean).join(" ");

const getMatchLevel = score => score >= 90 ? "strong" : score >= 75 ? "good" : score >= 60 ? "fair" : "bad";

const scoreJobForProfile = (job, profile) => {
    if (!profile) return { score: 0, level: "bad", matchedSkills: [] };
    const text = jobText(job);
    const skills = [...new Set(values(profile.skills).map(item => item.trim()).filter(item => item.length > 1))];
    const matchedSkills = skills.filter(skill => hasPhrase(text, skill));
    // Five exact skills are enough to earn the full technical-skill portion.
    let score = Math.min(55, matchedSkills.length * 11);

    const experience = Array.isArray(profile.experience) ? profile.experience : [];
    const roleTitles = experience.map(item => item.title).filter(Boolean);
    const titleWords = words(job.title);
    const bestRoleOverlap = roleTitles.reduce((best, title) => {
        const overlap = [...words(title)].filter(word => titleWords.has(word)).length;
        return Math.max(best, overlap);
    }, 0);
    score += Math.min(16, bestRoleOverlap * 4);
    if (roleTitles.some(title => hasPhrase(job.title, title) || hasPhrase(title, job.title))) score += 9;

    const seeking = preferenceValue(profile, /seeking|job type|employment/i).map(plain);
    const jobType = plain([job.title, job.employmentType, text].join(" "));
    if (seeking.some(value => value && jobType.includes(value))) score += 5;

    const preferredLocations = preferenceValue(profile, /location/i).concat([
        profile.personal?.city,
        profile.personal?.state,
    ]).map(plain).filter(value => value.length > 2);
    if (preferredLocations.some(location => plain(job.location).includes(location) || location.includes(plain(job.location)))) score += 8;

    const education = Array.isArray(profile.education) ? profile.education : [];
    const educationText = education.map(item => [item.degree, item.school].filter(Boolean).join(" ")).join(" ");
    if (/\b(bachelor|master|phd|degree)\b/i.test(text) && /\b(bachelor|master|phd|degree)\b/i.test(educationText)) score += 4;
    if (education.some(item => item.degree && hasPhrase(text, item.degree))) score += 3;

    const finalScore = Math.min(100, Math.round(score));
    return { score: finalScore, level: getMatchLevel(finalScore), matchedSkills: matchedSkills.slice(0, 4) };
};

const rankJobsForProfile = (jobs, profile) => [...jobs]
    .map(job => ({ ...job, profileMatch: scoreJobForProfile(job, profile) }))
    .sort((first, second) => second.profileMatch.score - first.profileMatch.score
        || new Date(second.postedAt || 0).getTime() - new Date(first.postedAt || 0).getTime()
        || String(first.title || "").localeCompare(String(second.title || "")));

module.exports = { scoreJobForProfile, rankJobsForProfile, getMatchLevel };
