-- Add template schema version field for future JSON migrations.
-- Stored as an integer so we can migrate between versions (1, 2, ...).
ALTER TABLE templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

