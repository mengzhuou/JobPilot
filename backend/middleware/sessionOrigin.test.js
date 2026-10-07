const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('./sessionOrigin');
const options = require('../config/sessionCookie');
test('cookie flags support Render HTTPS and local HTTP without exposing the token', () => {
    assert.deepEqual(options({NODE_ENV:'production'}), {httpOnly:true,secure:true,sameSite:'none',maxAge:604800000,path:'/'});
    assert.equal(options({NODE_ENV:'production',SESSION_SAME_SITE:'lax'}).sameSite,'lax');
    assert.equal(options({}).sameSite,'lax');
    assert.equal(options({}).secure,false);
});
test('session mutations require an exact trusted source, including login and logout', () => {
    const old = process.env.FRONTEND_ORIGIN;
    process.env.FRONTEND_ORIGIN='https://app.example.com';
    const run=(headers={},overrides={})=>{
        let code=200,passed=false;
        guard({method:'POST',originalUrl:'/api/profile',cookies:{jobpilot_session:'token'},get:name=>headers[name],...overrides},
            {status(value){code=value;return this;},json(){}},()=>{passed=true;});
        return {code,passed};
    };
    try {
        assert.equal(run({Origin:'https://app.example.com'}).passed,true);
        assert.equal(run({Referer:'https://app.example.com/profile'}).passed,true);
        for(const origin of ['null','https://evil.example','https://app.example.com.evil.test',undefined])
            assert.equal(run(origin?{Origin:origin}:{}).code,403);
        assert.equal(run({Origin:'null',Referer:'https://app.example.com'}).code,403);
        for(const path of ['/api/auth/google','/api/auth/login','/api/auth/register','/api/auth/logout'])
            assert.equal(run({}, {originalUrl:path,cookies:{}}).code,403);
        assert.equal(run({}, {method:'GET'}).passed,true);
        assert.equal(run({}, {cookies:{},originalUrl:'/api/extension/fill-plan'}).passed,true);
    } finally {if(old===undefined)delete process.env.FRONTEND_ORIGIN;else process.env.FRONTEND_ORIGIN=old;}
});
