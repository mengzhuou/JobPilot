const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const queries=[];
const query=async(sql,values)=>{
    queries.push({sql,values});
    if(sql.includes('SELECT id, user_id'))return {rows:[{id:'pair',user_id:'user'}]};
    if(sql.includes('INSERT INTO jobpilot.extension_tokens'))return {rows:[{id:'token',expires_at:null}]};
    return {rows:[],rowCount:1};
};
const context=vm.createContext({module:{exports:{}},require:name=>name==='crypto'?require('crypto'):{pool:{query,connect:async()=>({query,release(){}})}}});
vm.runInContext(fs.readFileSync(require.resolve('./extensionConnectionRepository'),'utf8'),context);
const repo=context.module.exports;
test('new connections have no expiry, keep hashed secrets and retain revocation checks',async()=>{
    const result=await repo.exchangePairingCode('ABCD-EFGH');
    assert.equal(result.expiresAt,null);
    const insert=queries.find(q=>q.sql.includes('INSERT INTO jobpilot.extension_tokens'));
    assert.match(insert.sql,/VALUES \(\$1::UUID, \$2, \$3, NULL\)/);
    assert.notEqual(insert.values[1],result.token);assert.equal(insert.values[1],repo.hashSecret(result.token));
    await repo.findActiveToken(result.token);await repo.listConnections('user');
    for(const q of queries.filter(q=>q.sql.includes('revoked_at IS NULL'))) {
        assert.match(q.sql,/expires_at IS NULL OR expires_at > NOW\(\)/);
    }
    await repo.revokeCurrentToken('token');assert.match(queries.at(-1).sql,/SET revoked_at=NOW\(\)/);
});
