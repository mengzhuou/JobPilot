CREATE TABLE jobpilot.filter_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES jobpilot.users(id) ON DELETE CASCADE,
    name VARCHAR(199) NOT NULL CHECK (length(btrim(name)) > 0),
    filters JSONB NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX filter_presets_user_name_unique
    ON jobpilot.filter_presets (user_id, lower(btrim(name)));
