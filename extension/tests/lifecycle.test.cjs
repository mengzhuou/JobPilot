const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createApplicationLifecycle } = require("../application-lifecycle");
const { submissionEvidence } = require("../submission-monitor");
const manifest = require("../manifest.json");

function setup() {
    const stored = {}, calls = [], tabs = new Map([[1, { id: 1, windowId: 8, url: "http://localhost:3000/autofill?jobId=42" }]]);
    let nextId = 10;
    const copy = value => structuredClone(value);
    const chrome = {
        runtime: { getManifest: () => manifest, sendMessage: async m => { calls.push(["broadcast", m]); } },
        storage: { session: {
            get: async key => ({ [key]: copy(stored[key]) }),
            set: async data => { Object.assign(stored, copy(data)); },
            remove: async keys => { for (const key of [].concat(keys)) delete stored[key]; },
        } },
        sidePanel: { open: async args => { calls.push(["panel", args]); } },
        permissions: { request: async () => true },
        scripting: { executeScript: async args => { calls.push(["inject", args]); } },
        webNavigation: { getAllFrames: async () => [{ frameId: 0 }, { frameId: 4 }] },
        windows: { update: async id => { calls.push(["window", id]); } },
        tabs: {
            create: async data => { const tab = { ...data, id: nextId++ }; tabs.set(tab.id, tab); return tab; },
            get: async id => { if (!tabs.has(id)) throw Error("closed"); return copy(tabs.get(id)); },
            update: async (id, data) => { Object.assign(tabs.get(id), data); calls.push(["activate", id]); },
            remove: async id => { tabs.delete(id); calls.push(["remove", id]); },
            sendMessage: async (id, message, options) => { calls.push(["message", id, message, options]); },
        },
    };
    const lifecycle = createApplicationLifecycle(chrome);
    const app = { tab: tabs.get(1), url: tabs.get(1).url, frameId: 0 };
    const launch = (sessionId = "12345678-1234-1234-1234-123456789abc") => lifecycle.launch({ jobUrl: "https://job-boards.greenhouse.io/example/jobs/1", sessionId }, app);
    const observed = type => lifecycle.observed({ type, evidence: "Thank you for applying!" }, { tab: { id: 10 }, frameId: 0 });
    return { chrome, lifecycle, app, launch, observed, stored, calls, tabs };
}
test("launch opens panel and broadcasts a rescan, including embedded forms", async () => {
    const t = setup(); await t.launch();
    assert(t.calls.some(([kind]) => kind === "panel"));
    assert(t.calls.some(([kind, m]) => kind === "broadcast" && m.type === "JOBPILOT_RESCAN_REQUEST" && m.tabId === 10));
    assert(t.calls.some(([kind, id, m, options]) => kind === "message" && id === 10 && m.type === "JOBPILOT_TRACK_APPLICATION" && options.frameId === 4));
});
test("success closes only job tab, returns to app, and waits for saved acknowledgement", async () => {
    const t = setup(); const session = await t.launch();
    await t.observed("JOBPILOT_APPLICATION_FORM_SEEN");
    await t.observed("JOBPILOT_APPLICATION_SUBMIT_ATTEMPT");
    await t.observed("JOBPILOT_APPLICATION_SUBMITTED");
    assert(!t.tabs.has(10)); assert(t.tabs.has(1));
    assert.equal((await t.lifecycle.status(t.app)).status, "submitted");
    assert(t.calls.some(([kind, id]) => kind === "activate" && id === 1));
    await t.lifecycle.saved({ sessionId: session.sessionId }, t.app);
    assert(!t.tabs.has(1));
});
test("closing without success asks for manual confirmation and never marks submitted", async () => {
    const t = setup(); await t.launch(); await t.observed("JOBPILOT_APPLICATION_FORM_SEEN");
    await t.lifecycle.removed(10);
    assert.equal((await t.lifecycle.status(t.app)).status, "closed");
    assert(t.tabs.has(1));
});
test("a submit click or unprompted thank-you message alone cannot confirm", async () => {
    const t = setup(); await t.launch();
    await t.observed("JOBPILOT_APPLICATION_FORM_SEEN");
    await t.observed("JOBPILOT_APPLICATION_SUBMITTED");
    assert.equal((await t.lifecycle.status(t.app)).status, "open");
    await t.observed("JOBPILOT_APPLICATION_SUBMIT_ATTEMPT");
    assert.equal((await t.lifecycle.status(t.app)).status, "open");
});
test("duplicate success and tab-close races preserve success", async () => {
    const t = setup(); await t.launch();
    await t.observed("JOBPILOT_APPLICATION_FORM_SEEN"); await t.observed("JOBPILOT_APPLICATION_SUBMIT_ATTEMPT");
    await Promise.all([t.observed("JOBPILOT_APPLICATION_SUBMITTED"), t.observed("JOBPILOT_APPLICATION_SUBMITTED"), t.lifecycle.removed(10)]);
    assert.equal((await t.lifecycle.status(t.app)).status, "submitted");
    assert.equal(t.calls.filter(([kind, id]) => kind === "remove" && id === 10).length, 1);
});
test("another tab or changed Autofill route cannot close or claim this launch", async () => {
    const t = setup(); const session = await t.launch();
    await t.lifecycle.saved({ sessionId: "wrong" }, t.app);
    assert(t.tabs.has(1));
    const other = { ...t.app, url: "http://localhost:3000/autofill?jobId=99" };
    await t.lifecycle.saved({ sessionId: session.sessionId }, other);
    assert(t.tabs.has(1)); assert.equal(await t.lifecycle.status(other), null);
    await assert.rejects(async () => t.lifecycle.launch({ jobUrl: "https://example.org", sessionId: session.sessionId }, { ...t.app, url: "https://evil.example/autofill" }));
});
test("reopening same job retains form tracking and focuses the existing tab", async () => {
    const t = setup(); await t.launch(); await t.observed("JOBPILOT_APPLICATION_FORM_SEEN");
    await t.launch("22345678-1234-1234-1234-123456789abc");
    assert.equal(t.tabs.size, 2);
    await t.observed("JOBPILOT_APPLICATION_SUBMIT_ATTEMPT"); await t.observed("JOBPILOT_APPLICATION_SUBMITTED");
    assert.equal((await t.lifecycle.status(t.app)).status, "submitted");
});
test("worker restart keeps session tracking, and permission denial opens no tab", async () => {
    const t = setup(); await t.launch();
    assert.equal((await createApplicationLifecycle(t.chrome).status(t.app)).status, "open");
    const denied = setup(); denied.chrome.permissions.request = async () => false;
    await assert.rejects(denied.launch(), /Allow JobPilot access/);
    assert.equal(denied.tabs.size, 1);
});
test("success evidence excludes job descriptions, validation failures, and URL-only redirects", () => {
    const inspect = (messages, hasApplicationForm = false, url = "https://example.org/confirmation") => submissionEvidence({ messages, hasApplicationForm, url });
    assert(inspect(["Thank you for applying!"]));
    assert(inspect(["Your application has been received."]));
    assert(inspect(["Thank you"]));
    assert.equal(inspect(["Application submitted"], true), "");
    assert.equal(inspect(["How to submit your application"]), "");
    assert.equal(inspect(["This field is required"]), "");
    assert.equal(inspect([]), "");
    assert.equal(inspect(["Thank you"], false, "https://example.org/jobs/1"), "");
});
