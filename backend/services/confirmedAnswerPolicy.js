// Deliberately independent of AI story memories: these are explicit application
// answers, never model-generated facts or material for an AI prompt.
const normalizeQuestion = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}+#']+/gu, ' ').trim().slice(0, 500);
const canRemember = field => {
    const question = normalizeQuestion(field?.label || field?.question);
    const context = normalizeQuestion(`${question} ${field?.name || ''} ${field?.autocomplete || ''}`);
    return question.length >= 4 && question !== 'unlabeled field'
        && !['password', 'hidden', 'file', 'submit', 'button', 'checkbox'].includes(field?.type)
        && !/\b(password|passcode|social security|ssn|passport|national id|tax id|bank|credit card|debit card|cc number|routing number|captcha|signature|certify|certification of|attest|agree|consent|acknowledge|privacy policy|terms of|verification code|one time code)\b/.test(context);
};
const applicationScope = value => {
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        url.hash = '';
        // Remove tracking, but retain job identifiers in the query string.
        [...url.searchParams.keys()].filter(key => /^(utm_|ref$|source$)/i.test(key)).forEach(key => url.searchParams.delete(key));
        url.searchParams.sort();
        return url.href.slice(0, 2000);
    } catch { return ''; }
};
const scopeFor = (question, url) => {
    const q = normalizeQuestion(question);
    // Only stable personal questions are reusable across employers. Other
    // answers (salary, motivation, prior employment here) belong to this job.
    const personal = /\b(gender|transgender|sexual orientation|racial|race|ethnic|ethnicity|hispanic|latino|disability|veteran|security clearance|polygraph)\b/.test(q)
        || /\b(work authorization|authorized to work|authorised to work|require sponsorship|need sponsorship|citizenship|years of experience)\b/.test(q)
        || /^(is your clearance from the md agency|first name|last name|full name|email|phone number)$/.test(q);
    const contextual = /\b(this|our|here|company|employer|role|position|job|willing|obtain|eligible|able to)\b/.test(q);
    return personal && !contextual ? 'personal' : applicationScope(url);
};
const cleanValues = values => Array.isArray(values) && values.length <= 20
    && values.every(value => typeof value === 'string' && value.trim().length <= 1200)
    ? [...new Set(values.map(value => value.trim()).filter(Boolean))] : null;
module.exports = { normalizeQuestion, canRemember, applicationScope, scopeFor, cleanValues };
