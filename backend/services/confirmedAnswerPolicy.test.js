const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeQuestion, canRemember, scopeFor, cleanValues} = require('./confirmedAnswerPolicy');
const {createDeterministicFillPlan} = require('./extensionAutofillPlanner');
const {mapProfileForAutofill} = require('./autofillProfileMapper');
const profile = mapProfileForAutofill({equalEmployment:[['Gender','Male'],['Transgender experience','No'],['Race','Asian'],['Hispanic or Latino','No'],['Disability','No'],['Sexual orientation','Heterosexual'],['Veteran status','Not a protected veteran']]}).profile;
const plan = (label, overrides={}, memories=[]) => createDeterministicFillPlan({profile,fields:[{fieldKey:'test',label,type:'combobox',...overrides}],memories}).answers[0];
test('screenshot questions match distinct explicit Profile answers', () => {
    for (const [question,value] of [
        ['How would you describe your gender identity?','Male'],
        ['How would you describe your racial/ethnic background?','Asian'],
        ['How would you describe your sexual orientation?','Heterosexual'],
        ['Do you identify as transgender?','No'],
        ['Do you have a disability or chronic condition (physical, visual, auditory, cognitive, mental, emotional, or other) that substantially limits one or more of your major life activities?','No'],
        ['Please identify your race','Asian'],
    ]) {assert.equal(plan(question).value,value,question);assert.equal(plan(question).action,'fill');}
    assert.equal(plan('Are you a veteran or active member of the United States Armed Forces?').action,'ask_user','Protected-veteran status does not establish all military service');
});
test('unknown clearance facts never become No or share a level/status answer', () => {
    for (const question of ['Do You Currently Hold an Active Security Clearance?','If Yes, Which level of Security Clearance Do You Hold?','Please Confirm Which Polygraph Level You Have:','Is Your Clearance from the MD Agency?']) {
        const answer=plan(question,{options:['Select...','Yes','No','Secret','Top Secret']});
        assert.equal(answer.action,'ask_user');assert.equal(answer.value,'');
    }
    const p={...profile,application_answers:{active_security_clearance:'No'}};
    const answers=createDeterministicFillPlan({profile:p,fields:[{fieldKey:'level',label:'Which security clearance level do you hold?',type:'select',options:['No','Secret']},{fieldKey:'active',label:'Do you hold an active security clearance?',type:'select',options:['Yes','No']}]}).answers;
    assert.equal(answers[0].action,'ask_user');assert.equal(answers[1].value,'No');
});
test('confirmed exact answers override Profile but never existing entries or changed choices', () => {
    const label='Do you identify as transgender?';
    const memory={normalized_question:normalizeQuestion(label),answer_values:['Prefer not to say']};
    assert.equal(plan(label,{},[memory]).value,'Prefer not to say');
    assert.equal(plan(label,{filled:true,currentValue:'No'},[memory]).action,'skip');
    assert.equal(plan(label,{options:['Yes','No']},[memory]).action,'ask_user');
    assert.equal(plan('Have you ever identified as transgender?',{},[memory]).source,'Profile · Equal Employment');
    const multi={normalized_question:normalizeQuestion('Please identify your race'),answer_values:['Asian','White']};
    assert.deepEqual(plan('Please identify your race',{type:'checkbox-group',options:['Asian','White','Other']},[multi]).values,['Asian','White']);
    assert.equal(plan('Please identify your race',{type:'select',options:['Asian','White']},[multi]).action,'ask_user');
});
test('safe matching preserves negation and job scope; secrets and attestations cannot be remembered', () => {
    assert.notEqual(normalizeQuestion('Do you have clearance?'),normalizeQuestion('Do you not have clearance?'));
    assert.equal(scopeFor('Do you currently hold an active security clearance?','https://a.test/job'),'personal');
    assert.notEqual(scopeFor('Why are you interested in this role?','https://a.test/job1'),scopeFor('Why are you interested in this role?','https://a.test/job2'));
    assert.equal(scopeFor('What is your expected salary?','https://a.test/job?id=42&utm_source=test'),'https://a.test/job?id=42');
    for (const label of ['Password','Social Security Number','Electronic signature','I consent to the privacy policy','Bank routing number']) assert.equal(canRemember({label,type:'text'}),false);
    assert.equal(canRemember({label:'Please identify your race',type:'select'}),true);
    assert.deepEqual(cleanValues([' No ','No']),['No']);assert.deepEqual(cleanValues([]),[]);assert.equal(cleanValues([{}]),null);
});
