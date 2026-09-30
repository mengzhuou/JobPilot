ALTER TABLE jobpilot.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- Existing Google accounts retain NULL hashes. Email uniqueness is already
-- enforced by users_email_lower_unique; never automatically link identities.
