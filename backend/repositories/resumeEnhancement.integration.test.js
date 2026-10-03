const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
// Explicit opt-in; all synthetic records are rolled back, never committed.
test('PostgreSQL draft → generation → separate résumé → job selection, rolled back', {skip:process.env.RUN_ENHANCEMENT_DB_TEST!=='1'}, async()=>{
    require('dotenv').config();
    const {pool}=require('../config/postgres');
    const repository=require('./resumeEnhancementRepository');
    const resumes=require('./resumeRepository');
    const service=require('../services/resumeEnhancementService');
    const client=await pool.connect(),originalConnect=pool.connect,originalQuery=pool.query;
    const userId=randomUUID(),token=randomUUID();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO jobpilot.users(id,auth_provider,provider_user_id,email) VALUES($1::uuid,'test',$3,$2)`,[userId,`enhancement-test-${userId}@example.invalid`,userId]);
        pool.query=client.query.bind(client);
        pool.connect=async()=>({release(){},query:(sql,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):client.query(sql,args)});
        const source='Synthetic Candidate\ncandidate@example.invalid\n\nEXPERIENCE\nBuilt Python services.\n\nEDUCATION\nBS Computer Science\n\nSKILLS\nPython';
        const resume=await resumes.create(userId,{fileName:'source.docx',displayName:'Original',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',fileSize:4,fileData:Buffer.from('test'),extractedText:source,extractedAt:new Date()});
        const job=service.normalizeJob({url:'https://example.invalid/job/1',title:'Engineer',summary:'We seek experience with Python, Docker and Kubernetes to build reliable application services for our customers and work with a collaborative team.'});
        const draft=await repository.create(userId,{sourceId:resume.id,sourceName:'Original',sourceText:source,job,analysis:service.assessResume(source,job),fingerprint:randomUUID()});
        assert.equal((await repository.get(userId,draft.id)).status,'assessed');
        assert.equal(await repository.get(randomUUID(),draft.id),undefined);
        await repository.startGeneration(userId,draft.id,{sections:['experience'],mode:'quick',evidence:''},token);
        await repository.finishGeneration(userId,draft.id,token,{changes:[],usage:{totalTokens:50}});
        await repository.updateReview(userId,draft.id,source);
        const saved=await repository.save(userId,draft.id,{text:source,displayName:'For this job',file:Buffer.from('test')});
        assert.notEqual(saved.id,resume.id);
        assert.equal((await resumes.findPrimaryFile(userId)).id,resume.id);
        assert.equal((await repository.selectResume(userId,job.url)).id,saved.id);
        assert.equal(await repository.selectResume(userId,'https://example.invalid/job/2'),undefined);
        assert.equal((await repository.save(userId,draft.id,{text:source,displayName:'Duplicate',file:Buffer.from('test')})).id,saved.id);
        await repository.setPreferences(userId,true);assert.equal((await repository.preferences(userId)).reminders_disabled,true);
        await repository.clearSelection(userId,job.url);assert.equal(await repository.selectResume(userId,job.url),undefined);
    } finally {
        pool.query=originalQuery;pool.connect=originalConnect;
        await client.query('ROLLBACK');client.release();await pool.end();
    }
});
