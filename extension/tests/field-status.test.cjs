const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../sidepanel.js'), 'utf8');
const functions = source.slice(source.indexOf('const fieldClass ='), source.indexOf('const focusField ='));
function classify(field, answer = {}) {
    const context = vm.createContext({ state: { results: new Map(), scan: { fields: [{ fieldKey: 'test', ...field }] } } });
    vm.runInContext(functions, context);
    context.answer = { fieldKey: 'test', action: 'ask_user', ...answer };
    return vm.runInContext('iconFor(fieldClass(answer))', context);
}
test('empty required fields are faults even when an answer is ready or AI-generated', () => {
    for (const action of ['ask_user', 'fill', 'skip']) assert.equal(classify({ required: true, filled: false }, { action, aiSuggestion: true }), '×');
});
test('empty optional fields are emphasized, not faults or checkmarks', () => {
    for (const action of ['ask_user', 'fill', 'skip']) assert.equal(classify({ required: false, filled: false }, { action }), '!');
});
test('invalid entered optional answers remain faults; already-filled answers stay skipped', () => {
    assert.equal(classify({ required: false, filled: false, hasError: true, currentValue: 'bad email' }), '×');
    assert.equal(classify({ filled: true }, { action: 'skip' }), '–');
});
