const assert = require("node:assert/strict");
const { findEquivalentFormOption, getAvailableFormOption } = require("./applicationAgentUtils");

assert.equal(findEquivalentFormOption(["I am not a protected veteran", "I am a protected veteran"], "Not a protected veteran"), "I am not a protected veteran");
assert.equal(findEquivalentFormOption(["Bachelor's Degree", "Master's Degree"], "Bachelor"), "Bachelor's Degree");
assert.equal(findEquivalentFormOption(["Yes", "No"], "No"), "No");
assert.equal(findEquivalentFormOption(["Yes", "No"], "Maybe"), null);
assert.equal(getAvailableFormOption({ options: ["I am not a protected veteran"] }, ["Not a protected veteran"]), "I am not a protected veteran");
console.log("Application option matching checks passed.");
