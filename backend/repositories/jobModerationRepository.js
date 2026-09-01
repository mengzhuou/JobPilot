const { pool } = require("../config/postgres");

const hasUserReportedJob = async (userId, jobUrl) => {
    const result = await pool.query(
        "SELECT EXISTS(SELECT 1 FROM jobpilot.job_reports WHERE user_id=$1 AND job_url=$2) AS reported",
        [userId, jobUrl]
    );
    return result.rows[0].reported;
};

const reportJob = async (userId, job) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
        `INSERT INTO jobpilot.job_reports
            (user_id, job_url, external_job_id, job_title, company, provider, reason, reason_detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, job_url) DO NOTHING
         RETURNING *`,
        [userId, job.jobUrl, job.externalJobId || null, job.jobTitle || null,
            job.company || null, job.provider || null, job.reason || null,
            job.reason === "Other" ? job.reasonDetail.trim() : null]
        );
        if (!result.rowCount) {
            const error = new Error("This job has already been reported by you");
            error.statusCode = 409;
            throw error;
        }
        await client.query(
            `INSERT INTO jobpilot.job_moderation
                (job_url,external_job_id,job_title,company,provider,permanently_blocked,moderation_status,resolution_note,reviewed_by,reviewed_at)
             VALUES ($1,$2,$3,$4,$5,TRUE,'permanently_blocked','Hidden after administrator report',$6,NOW())
             ON CONFLICT (job_url) DO UPDATE SET
                external_job_id=COALESCE(EXCLUDED.external_job_id,jobpilot.job_moderation.external_job_id),
                job_title=COALESCE(EXCLUDED.job_title,jobpilot.job_moderation.job_title),
                company=COALESCE(EXCLUDED.company,jobpilot.job_moderation.company),
                provider=COALESCE(EXCLUDED.provider,jobpilot.job_moderation.provider),
                permanently_blocked=TRUE,moderation_status='permanently_blocked',
                resolution_note='Hidden after administrator report',reviewed_by=$6,reviewed_at=NOW(),updated_at=NOW()`,
            [job.jobUrl, job.externalJobId || null, job.jobTitle || null,
                job.company || null, job.provider || null, userId]
        );
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const listModeration = async () => {
    const result = await pool.query(
        `SELECT moderation.*,
                COUNT(reports.id)::INTEGER AS report_count,
                COALESCE(JSON_AGG(DISTINCT CASE WHEN reports.reason='Other' AND reports.reason_detail IS NOT NULL THEN reports.reason || ': ' || reports.reason_detail ELSE reports.reason END) FILTER (WHERE reports.reason IS NOT NULL),'[]') AS reasons
         FROM jobpilot.job_moderation moderation
         LEFT JOIN jobpilot.job_reports reports ON reports.job_url=moderation.job_url
         GROUP BY moderation.id
         UNION ALL
         SELECT NULL::UUID, reports.job_url, MAX(reports.external_job_id), MAX(reports.job_title),
                MAX(reports.company), MAX(reports.provider), FALSE, '[]'::JSONB, NULL::UUID,
                NULL::TIMESTAMPTZ, MIN(reports.created_at), MAX(reports.updated_at),
                'pending', NULL::TEXT,
                COUNT(reports.id)::INTEGER,
                COALESCE(JSON_AGG(DISTINCT CASE WHEN reports.reason='Other' AND reports.reason_detail IS NOT NULL THEN reports.reason || ': ' || reports.reason_detail ELSE reports.reason END) FILTER (WHERE reports.reason IS NOT NULL),'[]')
         FROM jobpilot.job_reports reports
         WHERE NOT EXISTS (SELECT 1 FROM jobpilot.job_moderation moderation WHERE moderation.job_url=reports.job_url)
         GROUP BY reports.job_url
         ORDER BY updated_at DESC`
    );
    return result.rows;
};

const listActiveModeration = async () => {
    const result = await pool.query(
        "SELECT job_url,external_job_id,permanently_blocked,admin_tags FROM jobpilot.job_moderation WHERE permanently_blocked=TRUE OR admin_tags <> '[]'::JSONB"
    );
    return result.rows;
};

const updateModeration = async (adminId, job) => {
    const result = await pool.query(
        `INSERT INTO jobpilot.job_moderation
            (job_url,external_job_id,job_title,company,provider,permanently_blocked,admin_tags,reviewed_by,reviewed_at,moderation_status,resolution_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7::JSONB,$8,NOW(),$9,$10)
         ON CONFLICT (job_url) DO UPDATE SET
            external_job_id=COALESCE(EXCLUDED.external_job_id,jobpilot.job_moderation.external_job_id),
            job_title=COALESCE(EXCLUDED.job_title,jobpilot.job_moderation.job_title),
            company=COALESCE(EXCLUDED.company,jobpilot.job_moderation.company),
            provider=COALESCE(EXCLUDED.provider,jobpilot.job_moderation.provider),
            permanently_blocked=EXCLUDED.permanently_blocked,admin_tags=EXCLUDED.admin_tags,
            reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW(),moderation_status=EXCLUDED.moderation_status,
            resolution_note=EXCLUDED.resolution_note,updated_at=NOW()
         RETURNING *`,
        [job.jobUrl, job.externalJobId || null, job.jobTitle || null, job.company || null,
            job.provider || null, Boolean(job.permanentlyBlocked), JSON.stringify(job.adminTags || []), adminId,
            job.moderationStatus || (job.permanentlyBlocked ? "permanently_blocked" : "resolved_no_action"),
            job.resolutionNote || null]
    );
    await pool.query("UPDATE jobpilot.job_reports SET status='reviewed',updated_at=NOW() WHERE job_url=$1", [job.jobUrl]);
    return result.rows[0];
};

module.exports = { hasUserReportedJob, listActiveModeration, listModeration, reportJob, updateModeration };
