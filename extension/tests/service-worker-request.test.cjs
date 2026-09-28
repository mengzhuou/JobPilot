const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const event={addListener(){}};
test('worker retries 413 in smaller batches and retains every plan answer',async()=>{
    const sizes=[];
    const context=vm.createContext({console,URL,TextEncoder,importScripts(){},...require('../request-payload'),createApplicationLifecycle:()=>({}),chrome:{
        tabs:{onUpdated:event,onRemoved:event},webNavigation:{onCompleted:event},runtime:{onInstalled:event,onMessage:event},storage:{local:{get:async()=>({jobpilotExtensionToken:'synthetic-token'}),remove:async()=>{}}},
    },fetch:async(_url,options)=>{
        const fields=JSON.parse(options.body).fields;sizes.push(fields.length);
        if(fields.length>10)return {ok:false,status:413,json:async()=>({})};
        return {ok:true,status:200,json:async()=>({answers:fields.map(field=>({fieldKey:field.fieldKey,action:'fill',value:'saved'})),missingProfileFields:['phone']})};
    }});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),context);
    const result=await vm.runInContext(`handleMessage({type:'JOBPILOT_BUILD_PLAN',fields:Array.from({length:95},(_,i)=>({fieldKey:String(i)}))},{})`,context);
    assert.equal(result.answers.length,95);assert.equal(result.summary.ready,95);assert.equal(result.missingProfileFields.length,1);assert(sizes.some(size=>size===40));
});

test('detection requests a rescan without opening or filling; prompt click opens the panel',async()=>{
    let listener;const broadcasts=[],opens=[];
    const context=vm.createContext({console,URL,TextEncoder,importScripts(){},createApplicationLifecycle:()=>({}),chrome:{
        tabs:{onUpdated:event,onRemoved:event},webNavigation:{onCompleted:event},
        sidePanel:{open:async options=>opens.push(options)},
        runtime:{onInstalled:event,onMessage:{addListener:handler=>{listener=handler;}},getContexts:async()=>[],sendMessage:async message=>broadcasts.push(message)},
    }});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),context);
    const send=type=>new Promise(resolve=>listener({type},{tab:{id:1,windowId:2}},resolve));
    assert.equal((await send('JOBPILOT_APPLICATION_DETECTED')).ok,true);assert.equal(opens.length,0);assert.equal(broadcasts[0].type,'JOBPILOT_RESCAN_REQUEST');assert.equal(broadcasts[0].automatic,true);
    assert.equal((await send('JOBPILOT_OPEN_DETECTED')).ok,true);assert.equal(opens.length,1);assert.equal(opens[0].windowId,2);assert.equal(broadcasts.length,2);
    assert.equal((await send('JOBPILOT_PANEL_STATUS')).ok,true);assert.equal(broadcasts.length,2);
});
