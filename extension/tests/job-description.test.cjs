const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../../frontend/node_modules/jsdom');
const code=fs.readFileSync(path.join(__dirname,'../content-script.js'),'utf8');
function description(html) {
    const dom=new JSDOM(html,{url:'https://jobs.example.test/apply',runScripts:'outside-only'});
    try {
        dom.window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async()=>({})}};
        dom.window.eval(code.replace(/\}\)\(\);\s*$/, 'window.extractDescription=jobDescription;})();'));
        return dom.window.extractDescription();
    } finally {dom.window.close();}
}
test('job description prefers structured posting and preserves sections',()=>{
    const metadata=JSON.stringify({'@graph':[{'@type':'JobPosting',description:'<h2>Required qualifications</h2><p>Python and PostgreSQL</p><h2>Preferred qualifications</h2><p>Rust</p>'}]});
    const result=description(`<script type="application/ld+json">${metadata}</script><main>Unrelated Javascript<form>Personal answers</form></main>`);
    assert.match(result,/Required qualifications\nPython/);
    assert.match(result,/Preferred qualifications\nRust/);
    assert.ok(!result.includes('Personal answers')&&!result.includes('Javascript'));
});
test('DOM fallback excludes forms and works with malformed metadata',()=>{
    const result=description('<script type="application/ld+json">invalid</script><main><h2>Requirements</h2><p>Python</p><form>private answers<textarea>SECRET</textarea></form><nav>Navigation</nav></main>');
    assert.match(result,/Requirements\nPython/);
    assert.ok(!result.includes('SECRET')&&!result.includes('private')&&!result.includes('Navigation'));
});
