const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('Fill directly applies reviewed fields without any résumé assessment or fallback UI',async()=>{
    const source=fs.readFileSync(path.join(__dirname,'../sidepanel.js'),'utf8');
    const handler=source.slice(source.indexOf('const fillReviewedFields ='),source.indexOf('elements.aiButton.addEventListener'));
    const calls=[];let click;
    const state={applying:false,scanning:false,plan:[{fieldKey:'resume',action:'fill',resumeAttachment:true},{fieldKey:'name',action:'fill'},{fieldKey:'unknown',action:'skip'}]};
    vm.runInNewContext(handler,{state,elements:{fillButton:{addEventListener:(_,fn)=>{click=fn;}}},applyAnswers:async answers=>calls.push(answers),send:()=>{throw new Error('Must not assess before filling');}});
    await click();assert.deepEqual(calls[0],state.plan.slice(0,2));
    state.applying=true;await click();assert.equal(calls.length,1);
    state.applying=false;state.scanning=true;await click();assert.equal(calls.length,1);
    assert.ok(!source.includes('resumeCheckFallback'));
    assert.ok(!fs.readFileSync(path.join(__dirname,'../sidepanel.html'),'utf8').includes('resumeEnhancementPrompt'));
});
const setup=()=>{
    const requests=[],opened=[];const event={addListener(){}};
    const chrome={tabs:{onUpdated:event,onRemoved:event,get:async id=>({id,url:'https://example.com/job/1'}),query:async()=>[{id:5,url:'https://example.com/job/1'}],create:async options=>opened.push(options)},webNavigation:{onCompleted:event},runtime:{onInstalled:event,onMessage:event,getURL:file=>`chrome-extension://test/${file}`,getManifest:()=>({content_scripts:[{js:['app-bridge.js'],matches:['http://localhost:3000/*']}]}),sendMessage:async()=>{}},storage:{local:{get:async()=>({jobpilotExtensionToken:'test-token'}),set:async()=>{},remove:async()=>{}}}};
    const context=vm.createContext({console,URL,TextEncoder,importScripts(){},createApplicationLifecycle:()=>({}),chrome,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({available:true})};}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),context);
    return {requests,opened,send:(message,sender)=>{context.message=message;context.sender=sender;return vm.runInContext('handleMessage(message,sender)',context);}};
};
test('assessment only accepts panel messages for the currently bound application',async()=>{
    const {send,requests}=setup();const panel={url:'chrome-extension://test/sidepanel.html?embedded=1',tab:{id:5}};
    await assert.rejects(send({type:'JOBPILOT_RESUME_ASSESS',job:{url:'https://example.com/job/1'}},{url:'https://example.com/job/1',tab:{id:5}}),/panel/);
    await assert.rejects(send({type:'JOBPILOT_RESUME_ASSESS',job:{url:'https://example.com/job/2'}},panel),/changed/);
    await send({type:'JOBPILOT_RESUME_ASSESS',job:{url:'https://example.com/job/1'}},panel);
    assert.equal(requests.length,1);assert.equal(requests[0].options.headers.Authorization,'Bearer test-token');
});
test('enhancement opens only the configured app and never puts tokens or résumé text in a URL',async()=>{
    const {send,opened}=setup();const id='22222222-2222-4222-8222-222222222222';
    await send({type:'JOBPILOT_RESUME_ENHANCE',id},{url:'chrome-extension://test/sidepanel.html'});
    assert.equal(opened[0].url,`http://localhost:3000/resume-enhancement?id=${id}`);
    await assert.rejects(send({type:'JOBPILOT_RESUME_ENHANCE',id:'https://evil.example'},{url:'chrome-extension://test/sidepanel.html'}),/Invalid/);
});
