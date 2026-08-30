const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { pool } = require("../config/postgres");

const seedApplicationHistory = async () => {
    const requestedEmail = process.argv[2];
    const userResult = requestedEmail
        ? await pool.query(
            "SELECT id, email FROM jobpilot.users WHERE LOWER(email) = LOWER($1)",
            [requestedEmail]
        )
        : await pool.query(
            "SELECT id, email FROM jobpilot.users ORDER BY created_at LIMIT 1"
        );

    const user = userResult.rows[0];

    if (!user) {
        throw new Error(
            requestedEmail
                ? `No JobPilot user found for ${requestedEmail}`
                : "No JobPilot users exist. Sign in with Google first."
        );
    }

    const examples = [
        {
            externalJobId: "demo-openai-frontend-001",
            jobUrl: "https://openai.com/careers/",
            jobTitle: "Software Engineer, Frontend",
            company: "OpenAI",
            location: "San Francisco, CA",
            source: "Demo data",
            employmentType: "Full-time",
            workplaceType: "Hybrid",
            status: "applied",
            notes: "Example application — replace with your own follow-up notes.",
            daysAgo: 4,
        },
        {
            externalJobId: "demo-walmart-fullstack-002",
            jobUrl: "https://careers.walmart.com/technology",
            jobTitle: "Software Engineer II, Full Stack",
            company: "Walmart Global Tech",
            location: "Bentonville, AR",
            source: "Demo data",
            employmentType: "Full-time",
            workplaceType: "On-site",
            status: "interviewing",
            notes: "Example application — recruiter screen scheduled for next week.",
            daysAgo: 11,
        },
    ];

    for (const example of examples) {
        await pool.query(
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
                status,
                notes,
                applied_at,
                status_updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                NOW() - ($12 * INTERVAL '1 day'),
                NOW() - ($12 * INTERVAL '1 day')
            )
            ON CONFLICT (user_id, job_url)
            DO UPDATE SET
                job_title = EXCLUDED.job_title,
                company = EXCLUDED.company,
                location = EXCLUDED.location,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                updated_at = NOW()
            `,
            [
                user.id,
                example.externalJobId,
                example.jobUrl,
                example.jobTitle,
                example.company,
                example.location,
                example.source,
                example.employmentType,
                example.workplaceType,
                example.status,
                example.notes,
                example.daysAgo,
            ]
        );
    }

    console.log(`Seeded ${examples.length} example applications for ${user.email}.`);
};

seedApplicationHistory()
    .catch(error => {
        console.error("Application history seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
