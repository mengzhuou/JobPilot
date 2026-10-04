const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractJobSkills}=require('./jobSkillExtraction');
test('compact canonical skills retain priority and evidence and exclude boilerplate',()=>{
    const skills=extractJobSkills({summary:'Required qualifications:\nExperience with Python, Kubernetes and Snowflake.\nPreferred qualifications:\nExperience with PyTorch, LangChain and Dagster.\nBenefits:\nFree Excel classes and Java coffee.'});
    const byName=Object.fromEntries(skills.map(skill=>[skill.label,skill]));
    assert.equal(byName.Python.category,'required');
    assert.equal(byName.PyTorch.category,'preferred');
    assert.equal(byName.Dagster.category,'preferred');
    assert.match(byName.Kubernetes.evidence,/Experience with/);
    assert.ok(!byName.Excel && !byName.Java);
    assert.equal(new Set(skills.map(skill=>skill.label.toLowerCase())).size,skills.length);
});
test('required evidence wins and ordinary go is not a programming skill',()=>{
    const skills=extractJobSkills({summary:'Preferred qualifications:\nPython\nRequired qualifications:\nPython\nWe go above and beyond.'});
    assert.equal(skills.find(s=>s.label==='Python').category,'required');
    assert.ok(!skills.some(s=>s.label==='Go'));
});
