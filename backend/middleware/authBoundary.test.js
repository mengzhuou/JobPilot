const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost/unused';
process.env.SESSION_SECRET='test-boundary-secret';
process.env.FRONTEND_ORIGIN='https://app.example.com';
const tokens=require('../repositories/extensionConnectionRepository');
const controller=require('../controllers/extensionController');
const originalFind=tokens.findActiveToken,originalFill=controller.fillPlan;
let server,base;
before(async()=>{
    tokens.findActiveToken=async token=>token==='valid-extension-token'?{id:'connection',user_id:'extension-user'}:null;
    controller.fillPlan=(req,res)=>res.json({userId:req.auth.userId});
    const app=express();app.use(express.json());app.use(require('cookie-parser')());
    app.use('/api/extension',require('../routes/extensionRoutes'));
    app.post('/api/profile',require('./requireAuth'),(req,res)=>res.json({userId:req.auth.userId}));
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{tokens.findActiveToken=originalFind;controller.fillPlan=originalFill;await new Promise(resolve=>server.close(resolve));});
const cookie=()=>`jobpilot_session=${jwt.sign({userId:'browser-user'},process.env.SESSION_SECRET,{issuer:'jobpilot',audience:'jobpilot-web'})}`;
const request=(path,headers)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
test('extension token is authoritative even with an incidental web session cookie',async()=>{
    for(const Origin of ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','null']){
        const response=await request('/api/extension/fill-plan',{Origin,Cookie:cookie(),Authorization:'Bearer valid-extension-token'});
        assert.equal(response.status,200);assert.equal((await response.json()).userId,'extension-user');
    }
});
test('cookies cannot authenticate token routes; revoked/missing tokens still fail',async()=>{
    for(const Authorization of ['', 'Bearer revoked-token']){
        const response=await request('/api/extension/fill-plan',{Cookie:cookie(),Authorization});
        assert.equal(response.status,401);
    }
});
test('a bearer header does not bypass origin protection on profile or extension pairing',async()=>{
    for(const path of ['/api/profile','/api/extension/pair']){
        const response=await request(path,{Origin:'https://evil.example',Cookie:cookie(),Authorization:'Bearer valid-extension-token'});
        assert.equal(response.status,403);
    }
    const response=await request('/api/profile',{Origin:'https://app.example.com',Cookie:cookie()});
    assert.equal(response.status,200);assert.equal((await response.json()).userId,'browser-user');
});
