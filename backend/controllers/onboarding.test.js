const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('onboarding validates states and only writes the authenticated account',async()=>{
    const writes=[];
    const context=vm.createContext({process:{env:{}},module:{exports:{}},require:name=>name==='google-auth-library'?{OAuth2Client:class{}}:name.includes('userRepository')?{updateOnboarding:async(id,state)=>{writes.push({id,state});return state;}}:{}});
    vm.runInContext(fs.readFileSync(require.resolve('./authController'),'utf8'),context);
    const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
    for(const body of [{status:'bad',step:0},{status:'active',step:-1},{status:'active',step:11},{status:'active',step:'1'}]) {
        const res=response();await context.module.exports.saveOnboarding({body,auth:{userId:'self'}},res,()=>{});assert.equal(res.statusCode,400);
    }
    assert.equal(writes.length,0);
    const res=response();await context.module.exports.saveOnboarding({body:{status:'skipped',step:2,userId:'other'},auth:{userId:'self'}},res,()=>{});
    assert.equal(writes[0].id,'self');assert.equal(res.body.onboarding.status,'skipped');
});
