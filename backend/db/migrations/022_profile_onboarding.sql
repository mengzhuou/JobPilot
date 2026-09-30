ALTER TABLE jobpilot.users ADD COLUMN IF NOT EXISTS onboarding JSONB;
-- Existing users are evaluated using profile completeness. New accounts are
-- eligible even if their first profile fields are imported immediately.
ALTER TABLE jobpilot.users ALTER COLUMN onboarding SET DEFAULT '{"status":"pending","step":0}'::JSONB;
