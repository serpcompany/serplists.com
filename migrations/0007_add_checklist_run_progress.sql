-- Persist run progress (0-100) for checklist runs.
-- Frontend sends this value on run updates; without this column, updates can fail.

ALTER TABLE checklist_runs ADD COLUMN progress INTEGER DEFAULT 0;

