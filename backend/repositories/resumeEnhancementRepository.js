const { pool } = require('../config/postgres');
const { jobKey, fail } = require('../services/resumeEnhancementService');
const get = async (userId, id) => (await pool.query('SELECT * FROM jobpilot.resume_enhancements WHERE user_id=$1::uuid AND id=$2::uuid', [userId,id])).rows[0];
const preferences = async userId => (await pool.query('SELECT reminders_disabled FROM jobpilot.resume_enhancement_preferences WHERE user_id=$1::uuid',[userId])).rows[0] || { reminders_disabled:false };
const setPreferences = async (userId, disabled) => pool.query(`INSERT INTO jobpilot.resume_enhancement_preferences(user_id,reminders_disabled) VALUES($1::uuid,$2)
    ON CONFLICT(user_id) DO UPDATE SET reminders_disabled=EXCLUDED.reminders_disabled`,[userId,disabled]);
const create = async (userId, draft) => (await pool.query(`INSERT INTO jobpilot.resume_enhancements
    (user_id,source_resume_id,fingerprint,job_key,job,source_name,source_text,analysis)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING *`,
    [userId,draft.sourceId,draft.fingerprint,jobKey(draft.job.url),draft.job,draft.sourceName,draft.sourceText,draft.analysis])).rows[0];
const dismiss = async (userId,id) => pool.query('UPDATE jobpilot.resume_enhancements SET dismissed=true WHERE user_id=$1::uuid AND id=$2::uuid',[userId,id]);
const list = async userId => (await pool.query(`SELECT id,job,source_name,status,saved_resume_id,analysis,created_at FROM jobpilot.resume_enhancements
    WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 30`,[userId])).rows;
const selectResume = async (userId,url) => (await pool.query(`SELECT r.* FROM jobpilot.job_resume_selections s JOIN jobpilot.user_resumes r ON r.id=s.resume_id AND r.user_id=s.user_id
    WHERE s.user_id=$1::uuid AND s.job_key=$2`,[userId,jobKey(url)])).rows[0];
const clearSelection = async (userId,url) => pool.query('DELETE FROM jobpilot.job_resume_selections WHERE user_id=$1::uuid AND job_key=$2',[userId,jobKey(url)]);
const startGeneration = async (userId,id,options,token) => {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM jobpilot.users WHERE id=$1::uuid FOR UPDATE',[userId]);
        const row=(await client.query('SELECT * FROM jobpilot.resume_enhancements WHERE id=$1::uuid AND user_id=$2::uuid FOR UPDATE',[id,userId])).rows[0];
        if (!row) throw fail('Enhancement not found.',404);
        if (row.status==='generating' && Date.now()-new Date(row.updated_at).getTime()<120000) throw fail('This resume is already being enhanced.',409);
        // Ready/saved requests are idempotent: a network retry must not trigger another paid generation.
        if (['ready','saved'].includes(row.status)) { await client.query('COMMIT'); return null; }
        const count=(await client.query(`SELECT count(*)::int AS n FROM jobpilot.resume_enhancement_attempts WHERE user_id=$1::uuid
            AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[userId])).rows[0].n;
        if (count>=5) throw fail('Daily enhancement limit reached (5 per UTC day). You can still review, download or use an existing draft.',429);
        await client.query('INSERT INTO jobpilot.resume_enhancement_attempts(id,user_id,enhancement_id) VALUES($1::uuid,$2::uuid,$3::uuid)',[token,userId,id]);
        await client.query(`UPDATE jobpilot.resume_enhancements SET status='generating',options=$3,generation_id=$4::uuid,updated_at=NOW(),error_message=NULL,generated_at=NOW()
            WHERE user_id=$1::uuid AND id=$2::uuid`,[userId,id,options,token]);
        await client.query('COMMIT');
        return row;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};
const finishGeneration = async (userId,id,token,{changes,usage,error}) => {
    await pool.query('UPDATE jobpilot.resume_enhancement_attempts SET usage=$3 WHERE id=$1::uuid AND user_id=$2::uuid',[token,userId,usage||{}]);
    return pool.query(`UPDATE jobpilot.resume_enhancements
    SET status=$4,changes=$5,usage=$6,error_message=$7,updated_at=NOW()
    WHERE user_id=$1::uuid AND id=$2::uuid AND generation_id=$3::uuid`,[userId,id,token,error?'failed':'ready',JSON.stringify(changes||[]),usage||{},error||null]);
};
const updateReview = async (userId,id,text) => pool.query(`UPDATE jobpilot.resume_enhancements SET reviewed_text=$3 WHERE user_id=$1::uuid AND id=$2::uuid AND status='ready'`,[userId,id,text]);
const makeEditable = async (userId,id,text) => pool.query(`UPDATE jobpilot.resume_enhancements SET status='ready',reviewed_text=$3 WHERE user_id=$1::uuid AND id=$2::uuid AND status='assessed'`,[userId,id,text]);
const save = async (userId,id,{text,displayName,file}) => {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM jobpilot.users WHERE id=$1::uuid FOR UPDATE',[userId]);
        const draft=(await client.query('SELECT * FROM jobpilot.resume_enhancements WHERE user_id=$1::uuid AND id=$2::uuid FOR UPDATE',[userId,id])).rows[0];
        if (!draft) throw fail('Enhancement not found.',404);
        if (!['ready','saved'].includes(draft.status)) throw fail('Generate and review the resume first.',409);
        let resume;
        if (draft.saved_resume_id) resume=(await client.query('SELECT id,file_name,display_name FROM jobpilot.user_resumes WHERE user_id=$1::uuid AND id=$2::uuid',[userId,draft.saved_resume_id])).rows[0];
        if (!resume) {
            const count=(await client.query('SELECT count(*)::int AS n FROM jobpilot.user_resumes WHERE user_id=$1::uuid',[userId])).rows[0].n;
            if(count>=5) throw fail('Your 5 resume slots are full. Download this version, or remove an unused resume and retry. Your draft is safe.',409);
            resume=(await client.query(`INSERT INTO jobpilot.user_resumes(user_id,file_name,display_name,target_job_title,mime_type,file_size,file_data,extracted_text,extracted_at,is_primary)
                VALUES($1::uuid,$2,$3,$4,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$5,$6,$7,NOW(),false) RETURNING id,file_name,display_name`,
                [userId,`${displayName.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100)||'Tailored resume'}.docx`,displayName,draft.job.title.slice(0,199),file.length,file,text])).rows[0];
            await client.query(`UPDATE jobpilot.resume_enhancements SET status='saved',saved_resume_id=$3::uuid,reviewed_text=$4,updated_at=NOW() WHERE user_id=$1::uuid AND id=$2::uuid`,[userId,id,resume.id,text]);
        }
        await client.query(`INSERT INTO jobpilot.job_resume_selections(user_id,job_key,resume_id) VALUES($1::uuid,$2,$3::uuid)
            ON CONFLICT(user_id,job_key) DO UPDATE SET resume_id=EXCLUDED.resume_id`,[userId,draft.job_key,resume.id]);
        await client.query('COMMIT'); return resume;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
};
module.exports={get,create,list,preferences,setPreferences,dismiss,selectResume,clearSelection,startGeneration,finishGeneration,updateReview,makeEditable,save};
