const assert = require("node:assert/strict");
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/jobpilot_test";
const { isPrivateAddress } = require("./candidateContextService");
const { similarity, normalizeQuestion } = require("../repositories/applicationAnswerMemoryRepository");

assert.equal(isPrivateAddress("127.0.0.1"), true);
assert.equal(isPrivateAddress("10.1.2.3"), true);
assert.equal(isPrivateAddress("192.168.1.10"), true);
assert.equal(isPrivateAddress("8.8.8.8"), false);
assert.equal(isPrivateAddress("::1"), true);

assert.equal(normalizeQuestion(" Tell us about CLIENT work! "), "tell us about client work");
assert(
    similarity(
        "Describe a time you worked directly with a client to understand their needs",
        "Tell us about your experience gathering client requirements"
    ) > 0.18
);
assert(
    similarity(
        "Describe a time you worked directly with a client",
        "What is your desired salary?"
    ) < 0.18
);

console.log("Candidate context and answer-memory checks passed.");
