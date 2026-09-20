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
                required: ["fieldKey", "action", "value", "confidence", "source", "reason", "followUpQuestion"],
                properties: {
                    fieldKey: { type: "string" },
                    action: { type: "string", enum: ["fill", "ask_user", "skip"] },
                    value: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    source: { type: "string" },
                    reason: { type: "string" },
                    followUpQuestion: { type: "string" },
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
        jobType: item.jobType,
        location: item.location,
        from: item.from,
        to: item.to,
        summary: String(item.summary || "").slice(0, 500),
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

const createApplicationAnswerPlan = async ({
    job,
    profile,
    resume,
    fields,
    ambiguityMode = "auto_review",
    guidance = "",
    draftAnswers = [],
    candidateContext = {},
    answerMemories = [],
}) => {
    if (!process.env.OPENAI_API_KEY) {
        throw Object.assign(new Error("OpenAI is not configured. Add OPENAI_API_KEY to backend/.env."), { statusCode: 503 });
    }
    const safeFields = (fields || []).filter(field => field.type !== "file").slice(0, MAX_FIELD_COUNT).map(conciseField);
    if (!safeFields.length) return [];

    const allowedFieldKeys = new Set(safeFields.map(field => field.fieldKey));
    const revision = {
        guidance: String(guidance || "").slice(0, 1000),
        currentDrafts: (Array.isArray(draftAnswers) ? draftAnswers : [])
            .filter(answer => allowedFieldKeys.has(String(answer?.fieldKey || "")))
            .slice(0, safeFields.length)
            .map(answer => ({
                fieldKey: String(answer.fieldKey),
                value: String(answer.value || "").slice(0, MAX_TEXT_LENGTH),
            })),
    };
    const prompt = {
        job: {
            title: job?.title || "",
            company: job?.company || "",
            url: job?.url || "",
            description: String(job?.summary || "").slice(0, 6000),
            requirements: (job?.requirements || []).slice(0, 30),
        },
        candidateProfile: compactProfile(profile),
        primaryResume: candidateContext.resume || (resume ? { name: resume.display_name, targetJobTitle: resume.target_job_title } : null),
        portfolio: candidateContext.portfolio || null,
        linkedInHistory: candidateContext.linkedInHistory || null,
        previousAnswerMemories: (Array.isArray(answerMemories) ? answerMemories : []).slice(0, 12).map(memory => ({
            question: String(memory.question || "").slice(0, 500),
            userContext: String(memory.user_context || memory.userContext || "").slice(0, 2000),
            acceptedAnswer: String(memory.accepted_answer || memory.acceptedAnswer || "").slice(0, MAX_TEXT_LENGTH),
        })),
        fields: safeFields,
        ...(revision.guidance || revision.currentDrafts.length ? { revision } : {}),
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
                    text: `You are a job-application answer planner. Ground answers in the supplied JobPilot Profile, detailed work history, extracted résumé text, cached public portfolio text, previous user-approved answer memories, and factual context the user explicitly supplies in revision.guidance. Prefer specific projects, actions, technologies, and measurable results from those sources. Never invent experience, education, dates, compensation, legal eligibility, certifications, client interaction, links, or personal data. LinkedIn itself is not scraped; linkedInHistory contains the work history the candidate saved in JobPilot. Reuse a previous answer memory only when it genuinely answers the current question, adapting wording to the new role without changing facts. Revision guidance may request tone, length, wording, or provide user-confirmed facts; follow it without extrapolating beyond those facts. When a current draft is supplied, improve it rather than repeating it unchanged. For free-text questions, draft a useful response from relevant supported facts even when those facts cannot affirm every premise in the question; phrase limitations honestly. Return ask_user only when no grounded, useful answer is possible. For ask_user, leave value empty and provide a short, specific followUpQuestion asking which project or story the user wants to use and requesting the situation, their actions, and result. For fill, set followUpQuestion to an empty string. Use an option's exact text for select, radio, and checkbox fields. Do not answer passwords, signatures, certifications, consent, demographic, or voluntary self-identification fields: return ask_user. Keep written answers concise, natural, and under 1200 characters. The user selected ${ambiguityMode === "ask_user" ? "ask_user: ask the user whenever a required fact is not explicit" : "auto_review: make the best profile-grounded fill when possible, then flag it for review"}.`,
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
    return (parsed.answers || []).filter(answer => allowedFieldKeys.has(answer.fieldKey)).map(answer => ({
        ...answer,
        value: String(answer.value || "").slice(0, MAX_TEXT_LENGTH),
        source: String(answer.source || "").slice(0, 200),
        reason: String(answer.reason || "").slice(0, 500),
        followUpQuestion: String(answer.followUpQuestion || "").slice(0, 500),
    }));
};

module.exports = { createApplicationAnswerPlan };
