const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergeResumeProfile,parseResumeProfile}=require('./resumeProfileService');
test('imports only missing information, leaves sensitive answers and saved sections intact',()=>{
    const saved={personal:{firstName:'Saved',links:[{label:'LinkedIn',href:''}]},education:[{school:'Saved school'}],experience:[],skills:['Java'],equalEmployment:[['Gender','Female']],preferences:[['Seeking',['Full-time']]]};
    const result=mergeResumeProfile(saved,{personal:{firstName:'Other',lastName:'Ng',links:[{label:'LinkedIn',href:'https://linkedin.com/in/test'},{label:'bad',href:'javascript:alert(1)'}]},education:[{school:'New'}],experience:[{company:'Example',title:'Engineer',from:'2022-08'}],skills:['Python'],equalEmployment:[['Gender','Male']]});
    assert.equal(result.personal.firstName,'Saved');assert.equal(result.personal.lastName,'Ng');
    assert.equal(result.personal.links.length,1);assert.ok(result.personal.links[0].href);
    assert.deepEqual(result.education,saved.education);assert.deepEqual(result.skills,['Java']);
    assert.deepEqual(result.equalEmployment,saved.equalEmployment);assert.deepEqual(result.preferences,saved.preferences);
    assert.equal(result.experience[0].from,'2022-08');assert.equal(saved.personal.links[0].href,'');
    assert.deepEqual(mergeResumeProfile(result,result),result);
});
test('empty profiles receive separated education fields and skills; no inferred sensitive fields',()=>{
    const result=mergeResumeProfile({}, {personal:{firstName:'Avery'},education:[{school:'Example',degree:'BS',fieldOfStudy:'Computer Science',from:'2020',to:'2024'}],skills:['Python','Python'],race:'Asian'});
    assert.equal(result.education[0].fieldOfStudy,'Computer Science');assert.deepEqual(result.skills,['Python']);assert.deepEqual(result.equalEmployment,[]);
});
test('parser rejects unreadable text before calling the provider',async()=>{
    await assert.rejects(parseResumeProfile(''),/No readable/);
});
test('provider responses are constrained and failures do not produce a profile',async()=>{
    const previousFetch=global.fetch,previousKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
    try {
        global.fetch=async (_url,request)=>{const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return {ok:true,json:async()=>({output_text:JSON.stringify({personal:{firstName:'Avery'},skills:['Python']})})};};
        assert.equal((await parseResumeProfile('Avery Python')).personal.firstName,'Avery');
        global.fetch=async()=>({ok:true,json:async()=>({output_text:'invalid'})});
        await assert.rejects(parseResumeProfile('Avery'),/Unable to parse/);
        global.fetch=async()=>({ok:false});await assert.rejects(parseResumeProfile('Avery'),/temporarily unavailable/);
    } finally { global.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey; }
});
