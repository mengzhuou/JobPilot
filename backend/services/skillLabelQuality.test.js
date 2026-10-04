const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractJobSkills,validateSkills,fingerprint}=require('./jobSkillExtraction');
const {cleanSkill}=require('./skillLabelQuality');
const {scoreJobForProfile}=require('./profileMatchService');
const {assessResume}=require('./resumeEnhancementService');
const {mapProfileForAutofill}=require('./autofillProfileMapper');
const skill=label=>({label,aliases:[],category:'mentioned',evidence:`Experience with ${label}`});
test('screenshot fragments are rejected while meaningful unknown tools remain open-vocabulary',()=>{
    for(const label of ['e.g.','e.g','hardware.Perform','the design','developing','architecture of a modern','scalable','ID'])assert.equal(cleanSkill(skill(label)),null,label);
    for(const label of ['PyTorch','CNNs','LLMs','Node.js','ASP.NET','sharding','indexing','database internals','FluxWeave'])assert.equal(cleanSkill(skill(label)).label,label);
    assert.equal(cleanSkill(skill('particularly indexing')).label,'indexing');
});
test('employer entities do not become skills but vendor tools still do',()=>{
    const job={company:'OpenAI',summary:"Prototype OpenAI’s AI software stack (e.g. PyTorch) for new hardware.Perform system debugging. Experience with kernels, sharding and runtime systems."};
    const labels=extractJobSkills(job).map(x=>x.label);
    for(const label of ['OpenAI','e.g','hardware.Perform'])assert.ok(!labels.includes(label),label);
    for(const label of ['PyTorch','kernels','sharding','runtime systems'])assert.ok(labels.includes(label),label);
    assert.equal(cleanSkill(skill('OpenAI API'),job).label,'OpenAI API');
    assert.equal(cleanSkill(skill('OpenAI'),job),null,'Experience with an employer is not itself a tool skill');
    assert.equal(cleanSkill({...skill('MongoDB'),evidence:'Experience with MongoDB'}, {company:'MongoDB'}).label,'MongoDB');
    assert.equal(cleanSkill({...skill('FooWorks'),evidence:'Join FooWorks and change the world'},{}),null);
});
test('same quality gate covers model output, cached tags, profile scores and resume scores',()=>{
    const job={company:'OpenAI',summary:'OpenAI uses PyTorch. Experience with the design and developing.'};
    const inputs=[{...skill('OpenAI'),evidence:'OpenAI uses PyTorch'},{...skill('PyTorch'),evidence:'OpenAI uses PyTorch'},skill('the design')];
    assert.deepEqual(validateSkills(inputs,job.summary,job).map(x=>x.label),['PyTorch']);
    const cached={...job,skillExtraction:{key:fingerprint(job),source:'semantic',skills:inputs}};
    assert.deepEqual(extractJobSkills(cached).map(x=>x.label),['PyTorch']);
    assert.deepEqual(scoreJobForProfile(cached,{skills:['PyTorch']}).jobSkills,['PyTorch']);
    assert.deepEqual(assessResume('PyTorch',cached).keywords,['PyTorch']);
    const stale={...job,skillExtraction:{key:'old-v1-cache',skills:[skill('e.g.')]}};
    assert.ok(!extractJobSkills(stale).some(x=>x.label==='e.g.'));
});
test('legacy preferred locations remain usable by Autofill and duplicates merge',()=>{
    const preferences=[['Preferred locations',['Dallas, TX','Atlanta, GA']],['Preferred application location','dallas, tx']];
    assert.deepEqual(mapProfileForAutofill({preferences}).profile.application_answers.preferred_application_location,['dallas, tx','Atlanta, GA']);
    assert.equal(mapProfileForAutofill({preferences:[['Preferred locations','Dallas, TX']]}).profile.application_answers.preferred_application_location,'Dallas, TX');
});
