const {test} = require('node:test');
const assert = require('node:assert/strict');
const pool = {};
const databaseModule = require.resolve('../config/postgres');
require.cache[databaseModule] = {exports:{pool}};
const repository = require('./confirmedAutofillAnswerRepository');
test('memory queries are account-scoped, corrections upsert, clearing deletes, errors rollback', async () => {
    const calls=[];let fail=false;
    const query=async(sql,args)=>{calls.push({sql,args});if(fail && sql.includes('INSERT'))throw new Error('offline');return {rows:[{normalized_question:'please identify your race',scope:'personal',answer_values:['Asian']},{normalized_question:'why this job',scope:'https://other.test/job',answer_values:['Other']} ]};};
    const originalQuery=pool.query,originalConnect=pool.connect;
    pool.query=query;pool.connect=async()=>({query,release(){}});
    try {
        const rows=await repository.findForFields('user-a',[{label:'Please identify your race',type:'select'},{label:'Why this job?',type:'text'}],'https://example.test/job');
        assert.equal(rows.length,1);assert.equal(calls[0].args[0],'user-a');
        await repository.rememberMany('user-b',[{question:'Please identify your race',type:'select',values:['Asian','White']},{question:'Why this job?',type:'text',values:[]},{question:'Password',type:'password',values:['never-save']}],'https://example.test/job');
        const insert=calls.find(call=>call.sql.includes('INSERT'));
        assert.equal(insert.args[0],'user-b');assert.match(insert.sql,/ON CONFLICT/);assert.equal(insert.args[4],'["Asian","White"]');
        assert.ok(calls.some(call=>call.sql.includes('DELETE')&&call.args[0]==='user-b'));
        assert.ok(!calls.some(call=>JSON.stringify(call.args || []).includes('never-save')));
        await repository.forgetAll('user-b');assert.deepEqual(calls.at(-1).args,['user-b']);
        fail=true;
        await assert.rejects(repository.rememberMany('user-a',[{question:'Please identify your race',type:'select',values:['Asian']}],'https://example.test/job'),/offline/);
        assert.equal(calls.at(-1).sql,'ROLLBACK');
    } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});
