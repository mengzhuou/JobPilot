const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDeterministicFillPlan}=require('./extensionAutofillPlanner');
const plan=(status,label,options,other='')=>createDeterministicFillPlan({profile:{work_authorization:{citizenship_status:status,other_citizenship:other}},fields:[{fieldKey:'test',label,type:'radio',options}]}).answers[0];
const personOptions=['Yes, U.S. citizen','Yes, U.S. national','Yes, U.S. lawful permanent resident (Green card holder)','Yes, U.S. protected individual (e.g. asylum, refugee)','No'];
test('saved U.S. person categories map to specific screenshot options',()=>{
    ['U.S. citizen','U.S. national','U.S. lawful permanent resident','Protected individual'].forEach((status,index)=>assert.equal(plan(status,'Are you a U.S. Person — e.g., a U.S. citizen or national, U.S. lawful permanent resident, or protected individual?',personOptions).value,personOptions[index]));
});
test('citizenship subtypes are explicit; permanent residence does not establish dual citizenship',()=>{
    const label='Are you a U.S. citizen?';
    const options=['Yes, natural-born citizen','Yes, naturalized citizen','No'];
    assert.equal(plan('U.S. lawful permanent resident',label,options).value,'No');
    assert.equal(plan('U.S. citizen',label,options).action,'ask_user');
    assert.equal(plan('U.S. citizen — naturalized',label,options).value,options[1]);
    const dual='Are you a citizen of any country other than the United States (e.g., dual citizen)?';
    assert.equal(plan('U.S. lawful permanent resident',dual,['Yes','No']).action,'ask_user');
    assert.equal(plan('U.S. lawful permanent resident',dual,['Yes','No'],'Yes').value,'Yes');
});
test('referral question chooses Other only when available',()=>{
    assert.equal(plan('','How did you hear about us?',['LinkedIn','Other']).value,'Other');
    assert.equal(plan('','How did you hear about us?',['LinkedIn','Indeed']).action,'ask_user');
});
