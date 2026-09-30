const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../../frontend/node_modules/jsdom');
const html=fs.readFileSync(path.join(__dirname,'../sidepanel.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../sidepanel.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('panels restore saved login without flashing sign-in and follow shared logout/login changes',async()=>{
    const dom=new JSDOM(html,{url:'https://extension.test/sidepanel.html?embedded=1',runScripts:'outside-only'});
    const w=dom.window;let connected=true,changed,reply;
    w.chrome={runtime:{getManifest:()=>({version:'test'}),onMessage:{addListener(){}},sendMessage:(message,respond)=>{
        if(message.type==='JOBPILOT_GET_CONNECTION')reply=()=>respond({ok:true,data:{connected,backendUrl:'http://localhost:3500'}});
        else if(message.type==='JOBPILOT_SCAN')respond({ok:true,data:{tabId:1,supported:false,fields:[],job:{url:'https://example.com'}}});
    }},storage:{local:{get:async()=>({})},onChanged:{addListener:fn=>{changed=fn;}}}};
    try {
        w.eval(script);
        assert.equal(w.document.getElementById('disconnectButton'),null);
        assert.equal(w.document.getElementById('closePanelButton'),null);
        const login=w.document.getElementById('connectionView'),workspace=w.document.getElementById('workspaceView');
        assert(login.classList.contains('hidden'));
        reply();await flush();assert(login.classList.contains('hidden'));assert(!workspace.classList.contains('hidden'));
        connected=false;changed({jobpilotExtensionToken:{oldValue:'saved'}},'local');reply();await flush();
        assert(!login.classList.contains('hidden'));assert(workspace.classList.contains('hidden'));
        connected=true;changed({jobpilotExtensionToken:{newValue:'saved'}},'local');reply();await flush();
        assert(login.classList.contains('hidden'));assert(!workspace.classList.contains('hidden'));
    } finally {w.close();}
});
