const {pool}=require('../config/postgres');
const getMany=async keys=>{
    if(!keys.length)return new Map();
    const {rows}=await pool.query('SELECT fingerprint,result FROM jobpilot.job_skill_extractions WHERE fingerprint=ANY($1::text[]) AND result IS NOT NULL',[keys]);
    return new Map(rows.map(row=>[row.fingerprint,row.result]));
};
// Database lease deduplicates across server processes, not only browser tabs.
const claim=async key=>Boolean((await pool.query(`INSERT INTO jobpilot.job_skill_extractions(fingerprint,retry_after)
    VALUES($1,NOW()+INTERVAL '2 minutes') ON CONFLICT(fingerprint) DO UPDATE
    SET retry_after=NOW()+INTERVAL '2 minutes' WHERE job_skill_extractions.result IS NULL AND job_skill_extractions.retry_after<NOW()
    RETURNING fingerprint`,[key])).rowCount);
const save=async(key,result)=>pool.query('UPDATE jobpilot.job_skill_extractions SET result=$2::jsonb,updated_at=NOW() WHERE fingerprint=$1',[key,JSON.stringify(result)]);
const fail=async key=>pool.query("UPDATE jobpilot.job_skill_extractions SET retry_after=NOW()+INTERVAL '5 minutes' WHERE fingerprint=$1",[key]);
module.exports={getMany,claim,save,fail};
