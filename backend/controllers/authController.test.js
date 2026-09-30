const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const setup=()=>{
    let user=null,created,verified,createError;
    const repo={findUserByEmail:async()=>user,createPasswordUser:async values=>{if(createError)throw createError;created=values;return {id:'1',email:values.email,password_hash:'secret'};},recordLogin:async()=>{}};
    const context=vm.createContext({process:{env:{SESSION_SECRET:'test-secret'}},module:{exports:{}},require:name=>{
        if(name==='google-auth-library')return {OAuth2Client:class {}};
        if(name==='jsonwebtoken')return {sign:()=> 'session-token'};
        if(name.includes('userRepository'))return repo;
        return {validPassword:p=>typeof p==='string'&&p.length>=15&&p.length<=128,hashPassword:async()=> 'salted-hash',verifyPassword:async(p,h)=>{verified=h;return h==='valid'&&p==='correct password';}};
    }});
    vm.runInContext(fs.readFileSync(require.resolve('./authController'),'utf8'),context);
    const res=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},cookie(name,value,options){this.cookieOptions=options;},set(){}});
    return {api:context.module.exports,res,failCreate:error=>{createError=error;},setUser:value=>{user=value;},created:()=>created,verified:()=>verified};
};
test('registration normalizes email, passes only a hash to DB, and returns a safe cookie/user',async()=>{
    const t=setup(),res=t.res();
    await t.api.register({body:{email:' TEST@Example.com ',firstName:' Test ',lastName:' User ',password:'long unique passphrase'}},res);
    assert.equal(res.statusCode,201);assert.equal(t.created().email,'test@example.com');
    assert.equal(t.created().passwordHash,'salted-hash');assert.equal(t.created().password,undefined);
    assert.equal(res.body.user.password_hash,undefined);assert.equal(res.cookieOptions.httpOnly,true);assert.equal(res.cookieOptions.sameSite,'lax');
});
test('login uses identical failure messages for absent and Google-only accounts; correct password logs in',async()=>{
    const t=setup();
    for(const user of [null,{id:'1',password_hash:null},{id:'1',password_hash:'invalid'}]) {
        t.setUser(user);const res=t.res();await t.api.passwordLogin({body:{email:'a@example.com',password:'wrong password'}},res);
        assert.equal(res.statusCode,401);assert.equal(res.body.message,'Invalid email or password.');
    }
    t.setUser({id:'1',email:'a@example.com',password_hash:'valid'});const res=t.res();
    await t.api.passwordLogin({body:{email:'a@example.com',password:'correct password'}},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.user.password_hash,undefined);
});
test('invalid registration is rejected and duplicate emails never overwrite an account',async()=>{
    const t=setup(),res=t.res();await t.api.register({body:{email:'bad',password:'short'}},res);assert.equal(res.statusCode,400);assert.equal(t.created(),undefined);
    t.failCreate(Object.assign(new Error('database private detail'),{code:'23505'}));
    const duplicate=t.res();await t.api.register({body:{email:'a@example.com',password:'long unique password',firstName:'A',lastName:'B'}},duplicate);
    assert.equal(duplicate.statusCode,409);assert(!duplicate.body.message.includes('private detail'));
});
