const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
const noopEvent = { addListener() {} };
function setup(supported=true) {
    const loaded = new Set([0]), injected = [], applied = [], targets=[], requests=[];
    let frames = [{ frameId: 0 }, { frameId: 3 }, { frameId: 7, url: 'https://www.recaptcha.net/recaptcha' }, { frameId: 9 }];
    const context = vm.createContext({ console, URL, importScripts() {}, createApplicationLifecycle: () => ({ modeForTab: async () => 'autofill' }), chrome: {
        storage: {local:{get:async()=>({})},session:{get:async()=>({}),set:async()=>{},remove:async()=>{}}},
        tabs: { onUpdated: noopEvent, onRemoved: noopEvent, query: async () => [{ id: 12, url: 'https://example.org/job' }],get:async id=>{targets.push(id);return {id,url:'https://example.org/job'};},
            sendMessage: async (tab, message, { frameId }) => {
                requests.push(message.type);
                if (!loaded.has(frameId)) throw new Error('No receiver');
                if (message.type === 'JOBPILOT_PING') return { ready: true };
                if (message.type === 'JOBPILOT_APPLICATION_STATUS') return { supported };
                if (message.type === 'JOBPILOT_SCAN_FIELDS') return { fields: [{ fieldKey: 'same-name', type: 'text', label: 'Name' }], job: {} };
                if (message.type === 'JOBPILOT_APPLY_PLAN') { applied.push(frameId); return { results: [{ fieldKey: 'same-name', status: 'filled' }] }; }
            } },
        runtime: { onInstalled: noopEvent, onMessage: noopEvent,getURL:file=>`chrome-extension://test/${file}` },
        webNavigation: { onCompleted: noopEvent, getAllFrames: async () => frames },
        scripting: { executeScript: async ({ target }) => { assert.equal(target.frameIds.length, 1); const id = target.frameIds[0]; injected.push(id); if (id === 9) throw new Error('Permission denied'); loaded.add(id); } },
    } });
    vm.runInContext(source, context);
    return { context, loaded, injected, applied, targets, requests, addFrame: (id,url) => frames.push({ frameId: id,url }) };
}
test('top-frame receiver does not hide missing child scripts; inaccessible frames are reported', async () => {
    const t = setup();
    const scan = await vm.runInContext('scanActiveTab()', t.context);
    assert.deepEqual(Array.from(scan.fields, f => f.fieldKey), ['0::same-name', '3::same-name']);
    assert.deepEqual(Array.from(scan.inaccessibleFrames), [9]);
    assert.deepEqual(t.injected, [0, 3, 9, 9]);
    t.addFrame(4);
    const next = await vm.runInContext('scanActiveTab()', t.context);
    assert(next.fields.some(f => f.fieldKey === '4::same-name'));
    await vm.runInContext('applyToActiveTab([{fieldKey:"3::same-name",value:"Test",action:"fill"}])', t.context);
    assert.deepEqual(t.applied, [3]);
});
test('non-application pages stop before field scanning and planning',async()=>{
    const t=setup(false);
    const scan=await vm.runInContext('scanActiveTab()',t.context);
    assert.equal(scan.supported,false);assert.equal(scan.fields.length,0);
    assert.equal(scan.tabId,12);
    assert(!t.requests.includes('JOBPILOT_SCAN_FIELDS'));
});
test('browser internal pages are unsupported without script injection',async()=>{
    const t=setup();
    vm.runInContext("chrome.tabs.query=async()=>[{id:12,url:'chrome://extensions'}]",t.context);
    const scan=await vm.runInContext('scanActiveTab()',t.context);
    assert.equal(scan.supported,false);assert.equal(t.injected.length,0);
});
test('embedded assistants stay bound to their own tab and never scan their UI frame',async()=>{
    const t=setup();t.addFrame(77,'chrome-extension://test/sidepanel.html?embedded=1');
    const scan=await vm.runInContext(`handleMessage({type:'JOBPILOT_SCAN'},{url:'chrome-extension://test/sidepanel.html?embedded=1',tab:{id:99}})`,t.context);
    assert.equal(scan.tabId,99);assert.deepEqual(t.targets,[99]);assert(!t.injected.includes(77));assert(!scan.inaccessibleFrames.includes(77));
    await vm.runInContext(`handleMessage({type:'JOBPILOT_APPLY',answers:[]},{url:'chrome-extension://test/sidepanel.html?embedded=1',tab:{id:99}})`,t.context);
    assert.equal(t.targets.at(-1),99);
});
