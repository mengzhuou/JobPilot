const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('../../frontend/node_modules/jsdom');
const content=fs.readFileSync(path.join(__dirname,'../content-script.js'),'utf8');
function contentFixture() {
    const dom=new JSDOM('<!doctype html><label for="race">Please identify your race</label><select id="race"><option value="">Select...</option><option>Asian</option><option>White</option></select><label for="secret">Password</label><input id="secret" type="password"><label for="story">Describe your project</label><textarea id="story"></textarea>',{url:'https://jobs.example.test/apply',runScripts:'outside-only'});
    const w=dom.window,messages=[];let listener;
    w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});
    Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
    w.document.querySelectorAll('*').forEach(element=>{element.style.opacity='1';});
    w.chrome={runtime:{onMessage:{addListener:fn=>{listener=fn;}},sendMessage:async message=>{messages.push(message);return {ok:true,data:{saved:message.answers?.length}};}}};
    w.eval(content.replace(/\}\)\(\);\s*$/, 'window.testMemory={onManualEvent,saveManualChanges};})();'));
    const scan=(remember=true,rememberSession='account-a')=>new Promise(resolve=>listener({type:'JOBPILOT_SCAN_FIELDS',remember,rememberSession},{},resolve));
    return {dom,w,messages,scan};
}
test('only trusted manual changes are remembered; updates and clearing replace earlier answers',async()=>{
    const f=contentFixture();try {
        await f.scan();const input=f.w.document.getElementById('race');input.value='Asian';
        f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:false});await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,0);
        for(const value of ['Asian','White','']) {
            input.value=value;f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});await f.w.testMemory.saveManualChanges();
            assert.deepEqual(Array.from(f.messages.at(-1).answers[0].values),value?[value]:[]);
        }
        await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,3,'No duplicate save for unchanged values');
        const secret=f.w.document.getElementById('secret');secret.value='never-store';f.w.testMemory.onManualEvent({type:'change',target:secret,isTrusted:true});await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,3);
        await f.scan(false);input.value='Asian';f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,3);
    } finally {f.dom.window.close();}
});
test('switching account clears pending capture; native multi-select values are not split by commas',async()=>{
    const f=contentFixture();try {
        await f.scan();const input=f.w.document.getElementById('race');input.value='Asian';
        f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});await f.scan(true,'account-b');await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,0);
        input.multiple=true;input.options[2].selected=true;f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});await f.w.testMemory.saveManualChanges();
        assert.deepEqual(Array.from(f.messages[0].answers[0].values),['Asian','White']);
    } finally {f.dom.window.close();}
});
test('an unrelated committed dropdown never saves text that the user is still typing',async()=>{
    const f=contentFixture();try {
        await f.scan();const story=f.w.document.getElementById('story'),race=f.w.document.getElementById('race');
        story.value='An unfinished draft';f.w.testMemory.onManualEvent({type:'input',target:story,isTrusted:true});
        race.value='Asian';f.w.testMemory.onManualEvent({type:'change',target:race,isTrusted:true});await f.w.testMemory.saveManualChanges();
        assert.deepEqual(Array.from(f.messages[0].answers,answer=>answer.fieldKey),['race']);
        f.w.testMemory.onManualEvent({type:'focusout',target:story,isTrusted:true});await f.w.testMemory.saveManualChanges();
        assert.equal(f.messages[1].answers[0].fieldKey,'story');
    } finally {f.dom.window.close();}
});
test('slow saves are single-flight and preserve a newer correction',async()=>{
    const f=contentFixture();try {
        await f.scan();const input=f.w.document.getElementById('race');let finish;
        f.w.chrome.runtime.sendMessage=message=>{f.messages.push(message);return new Promise(resolve=>{finish=resolve;});};
        input.value='Asian';f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});const first=f.w.testMemory.saveManualChanges();
        input.value='White';f.w.testMemory.onManualEvent({type:'change',target:input,isTrusted:true});await f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,1);
        finish({ok:true});await first;
        const second=f.w.testMemory.saveManualChanges();assert.equal(f.messages.length,2);assert.equal(f.messages[1].answers[0].values[0],'White');finish({ok:true});await second;
    } finally {f.dom.window.close();}
});
function workerFixture() {
    const session={},local={jobpilotExtensionToken:'account-a-token'},calls=[];
    const event={addListener(){}};
    const store=data=>({get:async key=>key===null?{...data}:{...data},set:async values=>Object.assign(data,values),remove:async keys=>{for(const key of [].concat(keys))delete data[key];}});
    const context=vm.createContext({console,URL,TextEncoder,importScripts(){},createApplicationLifecycle:()=>({}),chrome:{
        tabs:{onUpdated:event,onRemoved:event},webNavigation:{onCompleted:event},runtime:{onInstalled:event,onMessage:event,getURL:file=>`chrome-extension://test/${file}`,sendMessage:async()=>{}},storage:{local:store(local),session:store(session)},
    },fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({saved:1})};}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),context);
    session['jobpilot.manual.1.0']={token:'account-a-token',url:'https://example.test/apply',jobUrl:'https://example.test/apply',documentId:'doc-1',fields:[{fieldKey:'race',label:'Please identify your race',type:'select'}]};
    return {context,session,local,calls,send:(message,sender)=>{context.message=message;context.sender=sender;return vm.runInContext('handleMessage(message,sender)',context);}};
}
test('worker scopes manual capture to scanned frame/document/account, rejects forged fields and forgets safely',async()=>{
    const f=workerFixture(),sender={tab:{id:1},frameId:0,url:'https://example.test/apply',documentId:'doc-1'};
    const message={type:'JOBPILOT_REMEMBER_MANUAL_ANSWERS',answers:[{fieldKey:'race',question:'Forged question',values:['Asian']},{fieldKey:'unscanned',values:['bad']}]};
    await f.send(message,sender);const body=JSON.parse(f.calls[0].options.body);assert.equal(body.answers.length,1);assert.equal(body.answers[0].question,'Please identify your race');
    for (const badSender of [{...sender,frameId:2},{...sender,url:'https://other.test/'},{...sender,documentId:'doc-2'}]) await assert.rejects(f.send(message,badSender));
    f.local.jobpilotExtensionToken='account-b-token';await assert.rejects(f.send(message,sender));f.local.jobpilotExtensionToken='account-a-token';
    await assert.rejects(f.send({type:'JOBPILOT_FORGET_MANUAL_ANSWERS'},sender));
    await f.send({type:'JOBPILOT_FORGET_MANUAL_ANSWERS'},{url:'chrome-extension://test/sidepanel.html'});
    assert.equal(f.local['jobpilot.rememberManualAnswers'],false);assert.equal(Object.keys(f.session).length,0);assert.equal(f.calls.at(-1).options.method,'DELETE');
    await assert.rejects(f.send(message,sender));
});
