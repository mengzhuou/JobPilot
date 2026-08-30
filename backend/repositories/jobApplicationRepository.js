const { pool } = require("../config/postgres");

const ALLOWED_STATUSES = new Set([
    "applied",
    "interviewing",
    "accepted",
    "rejected",
    "no_response",
    "withdrawn",
]);

const createOrRefreshApplication = async (userId, application) => {
    const result = await pool.query(
        `
        INSERT INTO jobpilot.job_applications (
            user_id,
            external_job_id,
            job_url,
            job_title,
            company,
            location,
            source,
            employment_type,
            workplace_type,
            job_posted_at,
            status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'applied')
        ON CONFLICT (user_id, job_url)
        DO UPDATE SET
            external_job_id = COALESCE(EXCLUDED.external_job_id, jobpilot.job_applications.external_job_id),
            job_title = COALESCE(EXCLUDED.job_title, jobpilot.job_applications.job_title),
            company = COALESCE(EXCLUDED.company, jobpilot.job_applications.company),
            location = COALESCE(EXCLUDED.location, jobpilot.job_applications.location),
            source = COALESCE(EXCLUDED.source, jobpilot.job_applications.source),
            employment_type = COALESCE(EXCLUDED.employment_type, jobpilot.job_applications.employment_type),
            workplace_type = COALESCE(EXCLUDED.workplace_type, jobpilot.job_applications.workplace_type),
            job_posted_at = COALESCE(EXCLUDED.job_posted_at, jobpilot.job_applications.job_posted_at),
            applied_at = NOW(),
            updated_at = NOW()
        RETURNING *
        `,
        [
            userId,
            application.externalJobId || null,
            application.jobUrl,
            application.jobTitle || null,
            application.company || null,
            application.location || null,
            application.source || null,
            application.employmentType || null,
            application.workplaceType || null,
            application.jobPostedAt || null,
        ]
    );

    return result.rows[0];
};

const createManualApplication = async (userId, application) => {
    if (!ALLOWED_STATUSES.has(application.status || "applied")) {
        throw Object.assign(new Error("Invalid application status"), { statusCode: 400 });
    }
    const result = await pool.query(
        `INSERT INTO jobpilot.job_applications
            (user_id,job_url,job_title,company,location,source,status,notes,applied_at)
         VALUES ($1,$2,$3,$4,$5,'Manual entry',$6::VARCHAR(30),$7,$8::TIMESTAMPTZ)
         ON CONFLICT (user_id,job_url) DO UPDATE SET
            job_title=EXCLUDED.job_title, company=EXCLUDED.company,
            location=EXCLUDED.location, status=EXCLUDED.status,
            notes=EXCLUDED.notes, applied_at=EXCLUDED.applied_at, updated_at=NOW()
         RETURNING *`,
        [userId,application.jobUrl,application.jobTitle,application.company,
            application.location || null,application.status || "applied",
            application.notes || null,application.appliedAt || new Date().toISOString()]
    );
    return result.rows[0];
};

const listApplications = async (userId, filters) => {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 12, 1), 50);
    const offset = (page - 1) * limit;
    const values = [userId];
    const conditions = ["user_id = $1"];

    if (filters.status && ALLOWED_STATUSES.has(filters.status)) {
        values.push(filters.status);
        conditions.push(`status = $${values.length}`);
    }

    if (filters.search?.trim()) {
        values.push(`%${filters.search.trim()}%`);
        conditions.push(`(
            job_title ILIKE $${values.length}
            OR company ILIKE $${values.length}
            OR location ILIKE $${values.length}
        )`);
    }

    const dateConditions = {
        today: "applied_at >= date_trunc('day', NOW())",
        week: "applied_at >= NOW() - INTERVAL '7 days'",
        month: "applied_at >= NOW() - INTERVAL '1 month'",
        three_months: "applied_at >= NOW() - INTERVAL '3 months'",
        year: "applied_at >= NOW() - INTERVAL '1 year'",
    };
    if (dateConditions[filters.dateRange]) {
        conditions.push(dateConditions[filters.dateRange]);
    }

    const where = conditions.join(" AND ");
    const countResult = await pool.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM jobpilot.job_applications
         WHERE ${where}`,
        values
    );

    values.push(limit, offset);
    const result = await pool.query(
        `
        SELECT *
        FROM jobpilot.job_applications
        WHERE ${where}
        ORDER BY applied_at DESC, created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
    );

    const total = countResult.rows[0].total;
    return {
        applications: result.rows,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
    };
};

const getApplicationSummary = async userId => {
    const result = await pool.query(
        `
        SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(*) FILTER (WHERE status = 'applied')::INTEGER AS applied,
            COUNT(*) FILTER (WHERE status = 'interviewing')::INTEGER AS interviewing,
            COUNT(*) FILTER (WHERE status = 'accepted')::INTEGER AS accepted,
            COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER AS rejected,
            COUNT(*) FILTER (WHERE status = 'no_response')::INTEGER AS no_response,
            COUNT(*) FILTER (WHERE status = 'withdrawn')::INTEGER AS withdrawn
        FROM jobpilot.job_applications
        WHERE user_id = $1
        `,
        [userId]
    );

    return result.rows[0];
};

const updateApplication = async (userId, applicationId, changes) => {
    if (!ALLOWED_STATUSES.has(changes.status)) {
        const error = new Error("Invalid application status");
        error.statusCode = 400;
        throw error;
    }

    const result = await pool.query(
        `
        UPDATE jobpilot.job_applications
        SET
            status = $1::VARCHAR(30),
            notes = $2,
            status_updated_at = CASE
                WHEN status <> $1::VARCHAR(30) THEN NOW()
                ELSE status_updated_at
            END,
            updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING *
        `,
        [changes.status, changes.notes || null, applicationId, userId]
    );

    return result.rows[0] || null;
};

const deleteApplication = async (userId, applicationId) => {
    const result = await pool.query(
        `DELETE FROM jobpilot.job_applications
         WHERE id = $1::UUID AND user_id = $2::UUID
         RETURNING id`,
        [applicationId, userId]
    );
    return Boolean(result.rows[0]);
};

const getJobApplicationSignals = async (userId, jobs) => {
    if (!jobs.length) return new Map();

    const urls = jobs.map(job => job.url).filter(Boolean);
    const externalIds = jobs.map(job => String(job.id || "")).filter(Boolean);
    const result = await pool.query(
        `
        SELECT
            job_url,
            external_job_id,
            COUNT(DISTINCT user_id)::INTEGER AS applicant_count,
            BOOL_OR(user_id = $1::UUID) AS current_user_applied
        FROM jobpilot.job_applications
        WHERE job_url = ANY($2::TEXT[])
           OR external_job_id = ANY($3::TEXT[])
        GROUP BY job_url, external_job_id
        `,
        [userId, urls, externalIds]
    );

    const signals = new Map();
    result.rows.forEach(row => {
        const value = {
            applicantCount: row.applicant_count,
            currentUserApplied: row.current_user_applied,
        };
        if (row.job_url) signals.set(`url:${row.job_url}`, value);
        if (row.external_job_id) signals.set(`id:${row.external_job_id}`, value);
    });
    return signals;
};

const getAppliedJobKeys = async userId => {
    const result = await pool.query(
        `SELECT job_url, external_job_id
         FROM jobpilot.job_applications
         WHERE user_id = $1::UUID`,
        [userId]
    );
    return new Set(result.rows.flatMap(row => [
        row.job_url && `url:${row.job_url}`,
        row.external_job_id && `id:${row.external_job_id}`,
    ]).filter(Boolean));
};

module.exports = {
    ALLOWED_STATUSES,
    createOrRefreshApplication,
    createManualApplication,
    deleteApplication,
    getJobApplicationSignals,
    getAppliedJobKeys,
    getApplicationSummary,
    listApplications,
    updateApplication,
};
