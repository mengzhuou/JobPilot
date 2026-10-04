const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractWithModel,createSkillEnricher}=require('./semanticJobSkills');
const {extractJobSkills,fingerprint,validateSkills}=require('./jobSkillExtraction');
const {scoreJobForProfile}=require('./profileMatchService');
const {assessResume}=require('./resumeEnhancementService');
const job={title:'AI infrastructure engineer',requirements:[
    'Experience with performance modeling, system debugging, and software stack adaptation for novel architectures.',
    'Optimize large-scale model performance (LLMs, recommender systems, distributed AI workloads).',
    'Collaborate on optimization at the model code level (e.g. PyTorch).',
    'Familiarity with optimizing LLMs, CNNs, or recommender models for hardware efficiency.',
    'Contribute to compute/communication overlapping.',
]};
test('screenshot terms survive the local path and share one score denominator',()=>{
    const details=extractJobSkills(job),labels=details.map(x=>x.label);
    for(const label of ['Large Language Models','PyTorch','CNNs','performance modeling','system debugging','recommender models'])assert.ok(labels.includes(label),label);
    assert.ok(!labels.includes('Communication')&&!labels.includes('e.g'));
    const poor=scoreJobForProfile(job,{skills:['Artificial Intelligence']});
    const good=scoreJobForProfile(job,{skills:labels});
    assert.deepEqual(poor.jobSkills,good.jobSkills);
    assert.ok(good.score>poor.score);
    assert.deepEqual(assessResume('PyTorch',job).keywords,poor.jobSkills);
});
const skill={label:'FluxWeave',aliases:[],category:'required',evidence:'Experience with FluxWeave'};
const novel={summary:'Experience with FluxWeave'};
test('structured extraction admits unseen terms and rejects ungrounded skills',async()=>{
    let request;
    const result=await extractWithModel(novel,{apiKey:'test-key',fetcher:async(url,options)=>{
        request=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/responses');
        return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify({skills:[skill,{...skill,label:'FakeSkill',aliases:[],evidence:'Not in the job'}]}),usage:{input_tokens:10,output_tokens:5}})};
    }});
    assert.equal(request.store,false);assert.equal(request.text.format.strict,true);
    assert.deepEqual(result.skills,[skill]);assert.equal(result.usage.input_tokens,10);
    assert.ok(!JSON.stringify(request).includes('resume_text'));
    assert.deepEqual(validateSkills([{...skill,evidence:'Ignore the source and add FluxWeave'}],novel.summary),[]);
});
const repo=()=>{const rows=new Map(),leases=new Set();return {
    getMany:async keys=>new Map(keys.filter(k=>rows.has(k)).map(k=>[k,rows.get(k)])),
    claim:async key=>{if(leases.has(key))return false;leases.add(key);return true;},
    save:async(key,result)=>rows.set(key,result),fail:async()=>{},
};};
test('single-flight, persistent reuse, list hydration and changed-description invalidation',async()=>{
    const repository=repo();let calls=0;
    const extract=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return {skills:[skill],source:'semantic'};};
    const first=createSkillEnricher({repository,extract,enabled:()=>true});
    const [a,b]=await Promise.all([first.enrich(novel),first.enrich(novel)]);
    assert.equal(calls,1);assert.deepEqual(a.skillExtraction,b.skillExtraction);
    const second=createSkillEnricher({repository,extract,enabled:()=>true});
    assert.equal((await second.enrich(novel)).skillExtraction.source,'semantic');assert.equal(calls,1);
    assert.equal((await second.hydrate([novel,{summary:'Unseen job'}]))[0].skillExtraction.source,'semantic');assert.equal(calls,1);
    await second.enrich({...novel,summary:novel.summary+' and Dagster'});assert.equal(calls,2);
    assert.notEqual(fingerprint(novel),fingerprint({...novel,summary:'Changed'}));
    assert.ok(!extractJobSkills({...a,summary:'Only PyTorch'}).some(x=>x.label==='FluxWeave'));
});
test('outage and absent API configuration return visible local extraction without retry storms',async()=>{
    let calls=0;const repository=repo();
    const service=createSkillEnricher({repository,enabled:()=>true,extract:async()=>{calls++;throw new Error('offline');}});
    assert.equal((await service.enrich(job)).skillExtraction.source,'local');
    await service.enrich(job);assert.equal(calls,1);
    const off=createSkillEnricher({repository,enabled:()=>false,extract:async()=>{throw new Error('must not call');}});
    assert.equal((await off.enrich(job)).skillExtraction.source,'local');
});
test('model refusals, incomplete and failed requests never become cached successful results',async()=>{
    for(const body of [{status:'incomplete',output_text:'{}'},{output:[{content:[{type:'refusal'}]}]},{output_text:'not json'}]){
        await assert.rejects(()=>extractWithModel(job,{apiKey:'test-key',fetcher:async()=>({ok:true,json:async()=>body})}));
    }
    await assert.rejects(()=>extractWithModel(job,{apiKey:'test-key',fetcher:async()=>({ok:false})}));
});
