const test=require('node:test');
const assert=require('node:assert/strict');
const {assessResume,normalizeJob,jobKey,validateOptions,validateChanges,applyChanges,generateChanges}=require('./resumeEnhancementService');
const {createResumeDocument}=require('./resumeDocumentService');
const mammoth=require('mammoth');
const source='Alex Candidate\nalex@example.com\n\nSUMMARY\nSoftware developer building reliable services.\n\nEXPERIENCE\nExample Co | Developer | 2022 - 2024\nBuilt Python services and reduced errors by 20%.\n\nEDUCATION\nBS Computer Science\n\nSKILLS\nPython, SQL';
const job=normalizeJob({url:'https://jobs.example.com/roles/123',title:'Backend developer',summary:'We are seeking an experienced developer. Requirements include Python, SQL, Kubernetes, Docker and Terraform. Build and maintain reliable cloud services.'});
const analysis=assessResume(source,job);
const options={sections:['experience'],mode:'quick',evidence:''};
test('validates and normalizes keyword choices without treating them as evidence',()=>{
    const selected=validateOptions({...options,consent:true,selectedKeywords:[' GraphQL ','graphql','Docker']});
    assert.deepEqual(selected.selectedKeywords,['graphql','Docker']);
    assert.deepEqual(validateOptions({...options,consent:true,selectedKeywords:[]}).selectedKeywords,[]);
    for(const selectedKeywords of ['GraphQL',[null],[' '],['a'.repeat(81)],Array(41).fill('Docker')])assert.throws(()=>validateOptions({...options,consent:true,selectedKeywords}));
    assert.throws(()=>validateChanges([{section:'experience',original:'Built Python services.',replacement:'Built GraphQL services.',reason:'Keyword focus'}],'Built Python services.',{...options,selectedKeywords:['GraphQL']},{missing:[]}),/unsupported skill/);
});
const change={section:'experience',original:'Built Python services and reduced errors by 20%.',replacement:'Reduced errors by 20% while building Python services.',reason:'Lead with the documented result.'};
test('scores actual resume text independently of a Profile and explains limitations',()=>{
    assert.equal(analysis.score,33);assert.deepEqual(analysis.matched,['Python','SQL']);assert.equal(analysis.shouldEnhance,true);assert.match(analysis.explanation,/not an employer ATS/);
    assert.equal(assessResume(source,{summary:'Hello',requirements:[]}).score,null);
    assert.equal(assessResume(source+'\nKubernetes Docker Terraform',job).shouldEnhance,false);
});
test('matching respects aliases and token boundaries',()=>{
    const result=assessResume('JavaScript Postgres AWS',normalizeJob({...job,summary:'This full time role requires Java, PostgreSQL, Amazon Web Services and experience developing production software. Help build our next generation systems.'}));
    assert.ok(!result.matched.includes('Java'));assert.ok(result.matched.includes('PostgreSQL'));assert.ok(result.matched.includes('AWS'));
});
test('job keys preserve job identity and remove only tracking',()=>{
    assert.equal(jobKey('https://example.com/job/1?utm_source=test'),jobKey('https://example.com/job/1'));
    assert.notEqual(jobKey('https://example.com/jobs?id=1'),jobKey('https://example.com/jobs?id=2'));
    assert.notEqual(jobKey('https://example.com/#/job/1'),jobKey('https://example.com/#/job/2'));
    assert.throws(()=>normalizeJob({url:'javascript:alert(1)'}));
});
test('requires consent, valid sections and bounded context',()=>{
    assert.throws(()=>validateOptions({...options,consent:true,instructions:'a'.repeat(1001)}));
    assert.equal(validateOptions({...options,consent:true,instructions:' Shorten the summary '}).instructions,'Shorten the summary');
    assert.throws(()=>validateOptions({...options,consent:false}));
    assert.throws(()=>validateOptions({...options,consent:true,sections:['education']}));
    assert.throws(()=>validateOptions({...options,consent:true,evidence:'a'.repeat(2001)}));
    assert.deepEqual(validateOptions({...options,consent:true}),options);
});
test('only exact, unique, nonoverlapping edits are accepted; unrelated text survives',()=>{
    const edits=validateChanges([change],source,options,analysis);
    const result=applyChanges(source,edits);assert.match(result,/EDUCATION\nBS Computer Science/);assert.match(result,/alex@example.com/);assert.ok(result.includes(change.replacement));
    assert.throws(()=>validateChanges([{...change,original:'Not in the source'}],source,options,analysis));
    assert.throws(()=>validateChanges([change,change],source,options,analysis));
    assert.throws(()=>validateChanges([{...change,section:'skills'}],source,options,analysis));
});
test('new unsupported quantities or job skills are rejected, factual evidence can support a skill',()=>{
    assert.throws(()=>validateChanges([{...change,replacement:'Improved reliability by 80%.'}],source,options,analysis));
    assert.throws(()=>validateChanges([{...change,replacement:'Built Kubernetes services.'}],source,options,analysis));
    assert.equal(validateChanges([{...change,replacement:'Built Kubernetes services.'}],source,{...options,evidence:'I built Kubernetes services at Example Co.'},analysis).length,1);
});
test('Responses API uses strict structure, never stores prompts and records token usage',async()=>{
    const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';
    try {
        const result=await generateChanges({source_text:source,job,analysis},{...options,selectedKeywords:['GraphQL']},async(url,request)=>{
            const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.match(body.input[0].content,/untrusted DATA/);
            assert.deepEqual(JSON.parse(body.input[1].content).missingKeywords,['GraphQL']);
            const line=JSON.parse(body.input[1].content).source_lines.find(line=>line.text===change.original);
            return {ok:true,json:async()=>({output_text:JSON.stringify({changes:[{section:change.section,startLine:line.id,endLine:line.id,replacement:change.replacement,reason:change.reason}]}),usage:{input_tokens:120,output_tokens:30,total_tokens:150},model:'test-model'})};
        });assert.equal(result.usage.totalTokens,150);assert.equal(result.changes.length,1);
        await assert.rejects(generateChanges({source_text:source,job,analysis},options,async()=>({ok:true,json:async()=>({status:'incomplete'})})),/could not complete/);
        await assert.rejects(generateChanges({source_text:source,job,analysis},options,async()=>({ok:true,json:async()=>({output:[{content:[{type:'refusal',refusal:'No'}]}]})})),/could not complete/);
        await assert.rejects(generateChanges({source_text:source,job,analysis},options,async()=>({ok:true,json:async()=>({output_text:'not JSON'})})),/unreadable/);
    }finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}
});
test('line references preserve Unicode and whitespace and disambiguate repeated text',async()=>{
    const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';
    const raw='Alex\r\n• Built\u00a0Python services.\r\nWrapped\tcontinuation.\r\n• Built\u00a0Python services.';
    const entry={section:'experience',startLine:4,endLine:4,replacement:'• Developed Python services.',reason:'Clearer wording.'};
    const request=async entries=>generateChanges({source_text:raw,job,analysis:{missing:[]}},options,async()=>({ok:true,json:async()=>({output_text:JSON.stringify({changes:entries})})}));
    try{
        const result=await request([entry]);
        assert.equal(result.changes[0].original,'• Built\u00a0Python services.');
        assert.equal(result.changes[0].sourceStart,raw.lastIndexOf('•'));
        assert.equal(applyChanges(raw,result.changes),raw.slice(0,raw.lastIndexOf('•'))+entry.replacement);
        const wrapped=await request([{...entry,startLine:2,endLine:3}]);
        assert.equal(wrapped.changes[0].original,'• Built\u00a0Python services.\r\nWrapped\tcontinuation.\r');
        for(const invalid of [{...entry,startLine:0},{...entry,endLine:99},{...entry,startLine:4,endLine:2},{...entry,startLine:null,endLine:null}])await assert.rejects(request([invalid]));
        await assert.rejects(request([entry,entry]),/conflicting source/);
    }finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}
});
test('exports an actual DOCX with readable text, Unicode and all original sections',async()=>{
    const text=applyChanges(source,[change])+'\nLanguages: Français, 中文';
    const buffer=await createResumeDocument(text);assert.equal(buffer.subarray(0,2).toString(),'PK');
    const extracted=await mammoth.extractRawText({buffer});
    for(const line of text.split('\n').filter(Boolean))assert.ok(extracted.value.includes(line),line);
});
