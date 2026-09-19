const assert = require("node:assert/strict");
const { rankJobsForProfile, scoreJobForProfile, getMatchLevel } = require("./profileMatchService");

const profile = {
    personal: { city: "Atlanta", state: "Georgia" },
    skills: ["React", "TypeScript", "Java", "Kubernetes", "AWS"],
    education: [{ degree: "Bachelor of Science in Computer Science" }],
    experience: [{ title: "Software Engineer", bullets: ["Built React services"] }],
    preferences: [["Seeking", ["Full-time"]], ["Preferred application location", ["Atlanta, GA"]]],
};
const matching = { title: "Software Engineer", location: "Atlanta, GA", employmentType: "Full-time", tags: ["React", "TypeScript"], summary: "Build Java services with Kubernetes and AWS", requirements: ["Bachelor degree in Computer Science"] };
const unrelated = { title: "Firmware Engineer", location: "Austin, TX", tags: ["C", "RTOS"], summary: "Embedded systems", requirements: [] };

assert(scoreJobForProfile(matching, profile).score > scoreJobForProfile(unrelated, profile).score);
assert.equal(rankJobsForProfile([unrelated, matching], profile)[0].title, "Software Engineer");
assert.equal(scoreJobForProfile(matching, null).score, 0);
assert.equal(getMatchLevel(94), "strong");
assert.equal(getMatchLevel(81), "good");
assert.equal(getMatchLevel(66), "fair");
assert.equal(getMatchLevel(59), "bad");
console.log("Profile match scoring checks passed.");
