const assert = require("node:assert/strict");
const { createApplicationAnswerPlan } = require("./applicationAiService");

const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;

(async () => {
    let requestBody;
    process.env.OPENAI_API_KEY = "test-key";
    global.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({
                output_text: JSON.stringify({
                    answers: [{
                        fieldKey: "client-question",
                        action: "fill",
                        value: "A clearer grounded answer.",
                        confidence: 0.9,
                        source: "Profile and user guidance",
                        reason: "Revised as requested.",
                        followUpQuestion: "",
                    }],
                }),
            }),
        };
    };

    const answers = await createApplicationAnswerPlan({
        job: { title: "Engineer", company: "Example", url: "https://example.com/job" },
        profile: { personal: { name: "Candidate" }, experience: [], skills: [] },
        fields: [{
            locatorKey: "client-question",
            question: "Describe your client experience.",
            type: "textarea",
            required: true,
            options: [],
        }],
        guidance: "Make it warmer and mention that I gathered requirements directly in weekly client meetings.",
        writingStyle: "Concise, first-person, no buzzwords.",
        draftAnswers: [
            { fieldKey: "client-question", value: "Original answer." },
            { fieldKey: "unrelated-field", value: "Must not be sent." },
        ],
        candidateContext: {
            resume: { name: "Primary résumé", text: "Built a customer reporting platform." },
            portfolio: { url: "https://example.com", text: "Portfolio project details." },
            linkedInHistory: { experience: [{ company: "Example", title: "Engineer" }] },
        },
        answerMemories: [{ question: "Tell us about a client project", user_context: "Weekly client interviews", accepted_answer: "I gathered requirements weekly." }],
    });

    const userPrompt = JSON.parse(requestBody.input[1].content[0].text);
    assert.equal(userPrompt.revision.writingStyle, "Concise, first-person, no buzzwords.");
    assert.equal(userPrompt.revision.guidance, "Make it warmer and mention that I gathered requirements directly in weekly client meetings.");
    assert.deepEqual(userPrompt.revision.currentDrafts, [{ fieldKey: "client-question", value: "Original answer." }]);
    assert.equal(userPrompt.primaryResume.text, "Built a customer reporting platform.");
    assert.equal(userPrompt.portfolio.text, "Portfolio project details.");
    assert.equal(userPrompt.previousAnswerMemories[0].userContext, "Weekly client interviews");
    assert.equal(answers[0].value, "A clearer grounded answer.");
    requestBody = null;
    const ignored = await createApplicationAnswerPlan({ fields: [
        { fieldKey: "dropdown", type: "combobox" },
        { fieldKey: "rating", type: "select" },
        { fieldKey: "radio", type: "radio" },
        { fieldKey: "file", type: "file" },
        { fieldKey: "done", type: "textarea", filled: true },
        { fieldKey: "choices", type: "text", options: ["Yes", "No"] },
    ] });
    assert.deepEqual(ignored, []);
    assert.equal(requestBody, null, "Non-written fields must not call OpenAI");
    console.log("Application AI revision checks passed.");
})().finally(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
