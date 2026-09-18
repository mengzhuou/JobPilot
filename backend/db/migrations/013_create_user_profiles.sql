CREATE TABLE IF NOT EXISTS jobpilot.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    personal JSONB NOT NULL DEFAULT '{}'::JSONB,
    education JSONB NOT NULL DEFAULT '[]'::JSONB,
    work_experience JSONB NOT NULL DEFAULT '[]'::JSONB,
    skills JSONB NOT NULL DEFAULT '[]'::JSONB,
    job_preferences JSONB NOT NULL DEFAULT '[]'::JSONB,
    equal_employment JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_profiles_personal_object CHECK (jsonb_typeof(personal) = 'object'),
    CONSTRAINT user_profiles_education_array CHECK (jsonb_typeof(education) = 'array'),
    CONSTRAINT user_profiles_work_experience_array CHECK (jsonb_typeof(work_experience) = 'array'),
    CONSTRAINT user_profiles_skills_array CHECK (jsonb_typeof(skills) = 'array'),
    CONSTRAINT user_profiles_job_preferences_array CHECK (jsonb_typeof(job_preferences) = 'array'),
    CONSTRAINT user_profiles_equal_employment_array CHECK (jsonb_typeof(equal_employment) = 'array')
);

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON jobpilot.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON jobpilot.user_profiles
FOR EACH ROW
EXECUTE FUNCTION jobpilot.set_updated_at();
