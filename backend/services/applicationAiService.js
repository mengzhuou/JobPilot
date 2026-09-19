const MAX_FIELD_COUNT = 80;
const MAX_TEXT_LENGTH = 1200;

const getOutputText = response => response.output_text || (response.output || [])
    .flatMap(item => item.content || [])
    .find(item => item.type === "output_text")?.text || "";

const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["answers"],
    properties: {
        answers: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["fieldKey", "action", "value", "confidence", "source", "reason"],
                properties: {
                    fieldKey: { type: "string" },
                    action: { type: "string", enum: ["fill", "ask_user", "skip"] },
                    value: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    source: { type: "string" },
                    reason: { type: "string" },
                },
            },
        },
    },
};

const conciseField = field => ({
    fieldKey: field.locatorKey,
    question: String(field.question || field.label || field.placeholder || "").slice(0, 500),
    type: field.type,
    required: Boolean(field.required),
    options: (field.options || []).slice(0, 40),
});

const compactProfile = profile => {
    const personal = profile?.personal || {};
    const trimExperience = item => ({
        company: item.company,
        title: item.title,
        from: item.from,
        to: item.to,
        bullets: (item.bullets || []).slice(0, 4).map(bullet => String(bullet).slice(0, 350)),
    });
    return {
        personal: { name: personal.name, email: personal.email, phone: personal.phone, city: personal.city, state: personal.state, country: personal.country, links: personal.links },
        education: (profile?.education || []).slice(0, 3),
        experience: (profile?.experience || []).slice(0, 6).map(trimExperience),
        skills: Array.isArray(profile?.skills) ? profile.skills.slice(0, 80) : Object.values(profile?.skills || {}).flat().slice(0, 80),
        preferences: profile?.preferences || [],
    };
};

const createApplicationAnswerPlan = async ({ job, profile, resume, fields, ambiguityMode = "auto_review" }) => {
    if (!process.env.OPENAI_API_KEY) {
        throw Object.assign(new Error("OpenAI is not configured. Add OPENAI_API_KEY to backend/.env."), { statusCode: 503 });
    }
    const safeFields = (fields || []).filter(field => field.type !== "file").slice(0, MAX_FIELD_COUNT).map(conciseField);
    if (!safeFields.length) return [];

    const prompt = {
        job: {
            title: job?.title || "",
            company: job?.company || "",
            url: job?.url || "",
            description: String(job?.summary || "").slice(0, 6000),
            requirements: (job?.requirements || []).slice(0, 30),
        },
        candidateProfile: compactProfile(profile),
        primaryResume: resume ? { name: resume.display_name, targetJobTitle: resume.target_job_title } : null,
        fields: safeFields,
    };
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-5-nano",
            input: [{
                role: "system",
                content: [{
                    type: "input_text",
                    text: `You are a job-application answer planner. Use only facts in the supplied candidate profile and primary-resume metadata. Never invent experience, education, dates, compensation, legal eligibility, certifications, or personal data. For each field, return fill only when its answer is directly supported; otherwise return ask_user. Use an option's exact text for select, radio, and checkbox fields. Do not answer passwords, signatures, certifications, consent, demographic, or voluntary self-identification fields: return ask_user. Keep written answers concise, natural, and under 1200 characters. The user selected ${ambiguityMode === "ask_user" ? "ask_user: ask the user whenever a fact is not explicit" : "auto_review: make the best profile-grounded fill when possible, then flag it for review"}.`,
                }],
            }, {
                role: "user",
                content: [{ type: "input_text", text: JSON.stringify(prompt) }],
            }],
            text: { format: { type: "json_schema", name: "application_answer_plan", strict: true, schema: responseSchema } },
        }),
        signal: AbortSignal.timeout(60000),
    });
    if (!apiResponse.ok) {
        const detail = await apiResponse.text().catch(() => "");
        throw Object.assign(new Error(`OpenAI request failed (${apiResponse.status}): ${detail.slice(0, 300)}`), { statusCode: 502 });
    }
    const payload = await apiResponse.json();
    let parsed;
    try { parsed = JSON.parse(getOutputText(payload)); }
    catch { throw Object.assign(new Error("OpenAI returned an invalid application plan."), { statusCode: 502 }); }
    const allowedKeys = new Set(safeFields.map(field => field.fieldKey));
    return (parsed.answers || []).filter(answer => allowedKeys.has(answer.fieldKey)).map(answer => ({
        ...answer,
        value: String(answer.value || "").slice(0, MAX_TEXT_LENGTH),
        source: String(answer.source || "").slice(0, 200),
        reason: String(answer.reason || "").slice(0, 500),
    }));
};

module.exports = { createApplicationAnswerPlan };
