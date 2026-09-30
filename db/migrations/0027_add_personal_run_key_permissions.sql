-- Existing keys keep what they could do before template writes existed.
ALTER TABLE personal_run_keys ADD COLUMN permissions TEXT NOT NULL DEFAULT '["templates:read","runs:read","runs:write"]';
