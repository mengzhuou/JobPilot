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
const aliasMatch = scoreJobForProfile({
    title: "AI Engineer",
    summary: "Build services with GCP, Azure, and Vue.",
    requirements: [],
}, { ...profile, skills: ["Artificial Intelligence", "Google Cloud Platform", "Microsoft Azure", "Vue.js"] });
assert.deepEqual(aliasMatch.matchedSkills.slice().sort(), ["Artificial Intelligence", "Google Cloud Platform", "Microsoft Azure", "Vue.js"].sort());
assert.equal(aliasMatch.breakdown.length, 3);
assert(aliasMatch.breakdown.every(item => item.percentage >= 0 && item.percentage <= 100));
const newGradMismatch = scoreJobForProfile({
    title: "Software Engineer, New Grad 2027",
    summary: "Build software with React, TypeScript, Java, Kubernetes, and AWS.",
    requirements: ["You're graduating in Spring 2027 in CS or a related technical field."],
}, { ...profile, education: [{ degree: "Bachelor of Science in Computer Science", to: "2024-12" }] });
assert.equal(newGradMismatch.breakdown.find(item => item.key === "experience").percentage, 0);
assert.equal(newGradMismatch.level, "bad");
assert(newGradMismatch.score <= 59);
assert.equal(getMatchLevel(94), "strong");
assert.equal(getMatchLevel(81), "good");
assert.equal(getMatchLevel(74), "good");
assert.equal(getMatchLevel(66), "fair");
assert.equal(getMatchLevel(59), "bad");
console.log("Profile match scoring checks passed.");
