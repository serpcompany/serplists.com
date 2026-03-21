ALTER TABLE checklist_runs
  ADD COLUMN is_public INTEGER DEFAULT 0;

ALTER TABLE checklist_runs
  ADD COLUMN share_token TEXT;

ALTER TABLE checklist_runs
  ADD COLUMN share_expires_at TEXT;

ALTER TABLE checklist_runs
  ADD COLUMN share_used_at TEXT;

CREATE INDEX IF NOT EXISTS idx_checklist_runs_share_token ON checklist_runs(share_token);
