-- Extension connections remain valid until explicitly disconnected or revoked.
-- Do not revive credentials that have already expired or been revoked.
ALTER TABLE jobpilot.extension_tokens ALTER COLUMN expires_at DROP NOT NULL;
UPDATE jobpilot.extension_tokens
SET expires_at = NULL
WHERE revoked_at IS NULL AND expires_at > NOW();
