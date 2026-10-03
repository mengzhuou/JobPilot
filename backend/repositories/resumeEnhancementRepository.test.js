const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost/unused';
const {pool}=require('../config/postgres');
const repo=require('./resumeEnhancementRepository');
test('save locks the account, enforces slots, preserves primary, binds only the reviewed job and is idempotent',async()=>{
    const original=pool.connect;const queries=[];let count=0,savedId=null;
    const client={release(){},query:async(sql,params)=>{
        queries.push({sql,params});
        if(sql.startsWith('SELECT * FROM jobpilot.resume_enhancements'))return {rows:[{status:savedId?'saved':'ready',saved_resume_id:savedId,job_key:'job-a',job:{title:'Developer'}}]};
        if(sql.startsWith('SELECT count(*)'))return {rows:[{n:count}]};
        if(sql.startsWith('INSERT INTO jobpilot.user_resumes')){savedId='new-resume';return {rows:[{id:savedId}]};}
        if(sql.startsWith('SELECT id,file_name'))return {rows:[{id:savedId}]};
        return {rows:[]};
    }};pool.connect=async()=>client;
    try{
        const args={text:'reviewed',displayName:'Tailored',file:Buffer.from('docx')};
        await repo.save('user','draft',args);await repo.save('user','draft',args);
        assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO jobpilot.user_resumes')).length,1);
        const insert=queries.find(q=>q.sql.startsWith('INSERT INTO jobpilot.user_resumes'));
        assert.match(insert.sql,/NOW\(\),false/);assert.ok(!queries.some(q=>q.sql.includes('SET is_primary')));
        assert.ok(queries.some(q=>q.sql.includes('jobpilot.users')&&q.sql.includes('FOR UPDATE')));
        assert.ok(queries.some(q=>q.sql.includes('INSERT INTO jobpilot.job_resume_selections')&&q.params[1]==='job-a'));
        count=5;savedId=null;queries.length=0;
        await assert.rejects(repo.save('user','draft',args),/slots are full/);
        assert.ok(queries.some(q=>q.sql==='ROLLBACK'));assert.ok(!queries.some(q=>q.sql.startsWith('INSERT INTO')));
    }finally{pool.connect=original;}
});
test('generation is single-flight and protects the daily budget with a persisted attempt record',async()=>{
    const original=pool.connect;const queries=[];let status='assessed',count=0;
    pool.connect=async()=>({release(){},query:async(sql,params)=>{
        queries.push({sql,params});
        if(sql.startsWith('SELECT * FROM jobpilot.resume_enhancements'))return {rows:[{status,updated_at:new Date()}]};
        if(sql.startsWith('SELECT count(*)'))return {rows:[{n:count}]};
        return {rows:[]};
    }});
    try{
        await repo.startGeneration('user','draft',{},'attempt');
        assert.ok(queries.some(q=>q.sql.includes('INSERT INTO jobpilot.resume_enhancement_attempts')));
        status='generating';await assert.rejects(repo.startGeneration('user','draft',{},'attempt2'),/already being enhanced/);
        status='ready';assert.equal(await repo.startGeneration('user','draft',{},'attempt3'),null);
        status='failed';count=5;await assert.rejects(repo.startGeneration('user','draft',{},'attempt4'),/Daily enhancement limit/);
    }finally{pool.connect=original;}
});
