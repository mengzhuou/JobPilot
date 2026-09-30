const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const event={addListener(){}};
const setup=()=>{
    const stored={},requests=[],opened=[];
    const chrome={tabs:{onUpdated:event,onRemoved:event,create:async options=>opened.push(options)},webNavigation:{onCompleted:event},runtime:{onInstalled:event,onMessage:event,getURL:file=>`chrome-extension://test/${file}`,getManifest:()=>({content_scripts:[{js:['app-bridge.js'],matches:['http://localhost:3000/*']}]}),sendMessage:async()=>{}},storage:{local:{get:async()=>stored,set:async values=>Object.assign(stored,values),remove:async()=>{}}}};
    const context=vm.createContext({console,URL,TextEncoder,importScripts(){},createApplicationLifecycle:()=>({}),chrome,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({token:'secret-extension-token',expiresAt:'later'})};}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),context);
    return {context,stored,requests,opened,send:(message,sender)=>{context.message=message;context.sender=sender;return vm.runInContext('handleMessage(message,sender)',context);}};
};
test('connection only accepts the configured top-level Profile page; tokens stay in extension storage',async()=>{
    const {send,stored,requests}=setup();
    for(const sender of [{url:'https://evil.example/profile',tab:{id:1},frameId:0},{url:'http://localhost:3000/profile',tab:{id:1},frameId:1},{url:'http://localhost:3000/autofill',tab:{id:1},frameId:0}])await assert.rejects(send({type:'JOBPILOT_CONNECT_ACCOUNT',code:'ABCD-EFGH'},sender),/Connect only/);
    assert.equal(requests.length,0);
    const result=await send({type:'JOBPILOT_CONNECT_ACCOUNT',code:'ABCD-EFGH'},{url:'http://localhost:3000/profile?connectExtension=1',tab:{id:1},frameId:0});
    assert.equal(result.connected,true);assert.equal(result.token,undefined);assert.equal(stored.jobpilotExtensionToken,'secret-extension-token');
    assert.equal(requests[0].url,'http://localhost:3500/api/extension/exchange');
    assert.equal(requests[0].options.headers.Authorization,undefined);
});
test('sign-in can only be launched by sidepanel and only to a registered app origin',async()=>{
    const {send,opened}=setup();
    await assert.rejects(send({type:'JOBPILOT_OPEN_SIGN_IN'}, {url:'http://localhost:3000/profile',tab:{id:1}}),/extension panel/);
    await assert.rejects(send({type:'JOBPILOT_OPEN_SIGN_IN',backendUrl:'https://unregistered.example'},{url:'chrome-extension://test/sidepanel.html'}),/does not include/);
    await send({type:'JOBPILOT_OPEN_SIGN_IN',backendUrl:'http://localhost:3500'},{url:'chrome-extension://test/sidepanel.html'});
    assert.equal(opened[0].url,'http://localhost:3000/profile?connectExtension=1');
});
