-- Add template type (single-select) with default.
ALTER TABLE templates ADD COLUMN type TEXT NOT NULL DEFAULT 'checklist';
