const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
const noopEvent = { addListener() {} };
function setup() {
    const loaded = new Set([0]), injected = [], applied = [];
    let frames = [{ frameId: 0 }, { frameId: 3 }, { frameId: 7, url: 'https://www.recaptcha.net/recaptcha' }, { frameId: 9 }];
    const context = vm.createContext({ console, URL, importScripts() {}, createApplicationLifecycle: () => ({ modeForTab: async () => 'autofill' }), chrome: {
        tabs: { onUpdated: noopEvent, onRemoved: noopEvent, query: async () => [{ id: 12, url: 'https://example.org/job' }],
            sendMessage: async (tab, message, { frameId }) => {
                if (!loaded.has(frameId)) throw new Error('No receiver');
                if (message.type === 'JOBPILOT_PING') return { ready: true };
                if (message.type === 'JOBPILOT_SCAN_FIELDS') return { fields: [{ fieldKey: 'same-name', type: 'text', label: 'Name' }], job: {} };
                if (message.type === 'JOBPILOT_APPLY_PLAN') { applied.push(frameId); return { results: [{ fieldKey: 'same-name', status: 'filled' }] }; }
            } },
        runtime: { onInstalled: noopEvent, onMessage: noopEvent },
        webNavigation: { onCompleted: noopEvent, getAllFrames: async () => frames },
        scripting: { executeScript: async ({ target }) => { assert.equal(target.frameIds.length, 1); const id = target.frameIds[0]; injected.push(id); if (id === 9) throw new Error('Permission denied'); loaded.add(id); } },
    } });
    vm.runInContext(source, context);
    return { context, loaded, injected, applied, addFrame: id => frames.push({ frameId: id }) };
}
test('top-frame receiver does not hide missing child scripts; inaccessible frames are reported', async () => {
    const t = setup();
    const scan = await vm.runInContext('scanActiveTab()', t.context);
    assert.deepEqual(Array.from(scan.fields, f => f.fieldKey), ['0::same-name', '3::same-name']);
    assert.deepEqual(Array.from(scan.inaccessibleFrames), [9]);
    assert.deepEqual(t.injected, [3, 9]);
    t.addFrame(4);
    const next = await vm.runInContext('scanActiveTab()', t.context);
    assert(next.fields.some(f => f.fieldKey === '4::same-name'));
    await vm.runInContext('applyToActiveTab([{fieldKey:"3::same-name",value:"Test",action:"fill"}])', t.context);
    assert.deepEqual(t.applied, [3]);
});
