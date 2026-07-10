-- Team/workspace foundations plus DB-backed history.
-- These tables are intentionally D1-only and avoid new paid services.

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  billing_owner_user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (billing_owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_teams_slug_unique ON teams(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_teams_created_by_user_id ON teams(created_by_user_id);

CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by_user_id TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_team_members_team_user_unique ON team_members(team_id, user_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_role ON team_members(team_id, role);

CREATE TABLE team_invites (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  token_hash TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_team_invites_token_hash_unique ON team_invites(token_hash);
CREATE INDEX idx_team_invites_team_email ON team_invites(team_id, email);
CREATE INDEX idx_team_invites_email ON team_invites(email);

CREATE TABLE team_entitlement_overrides (
  team_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  diff_json TEXT,
  metadata_json TEXT,
  request_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_events_subject ON audit_events(subject_type, subject_id, created_at);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id, created_at);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id, created_at);

CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  changed_by_user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  content_hash TEXT,
  change_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_template_versions_template_version_unique ON template_versions(template_id, version);
CREATE INDEX idx_template_versions_subject ON template_versions(subject_type, subject_id, created_at);

ALTER TABLE templates ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'user';
ALTER TABLE templates ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_templates_owner ON templates(owner_type, user_id, team_id);
CREATE INDEX idx_templates_team_id ON templates(team_id);

UPDATE templates
SET owner_type = 'user',
    created_by_user_id = COALESCE(created_by_user_id, user_id)
WHERE created_by_user_id IS NULL;

ALTER TABLE checklist_runs ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE checklist_runs ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE checklist_runs ADD COLUMN assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE checklist_runs ADD COLUMN started_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE checklist_runs ADD COLUMN completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE checklist_runs ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_checklist_runs_team_id ON checklist_runs(team_id);
CREATE INDEX idx_checklist_runs_assigned_to_user_id ON checklist_runs(assigned_to_user_id);

UPDATE checklist_runs
SET created_by_user_id = COALESCE(created_by_user_id, user_id),
    started_by_user_id = COALESCE(started_by_user_id, user_id)
WHERE created_by_user_id IS NULL OR started_by_user_id IS NULL;
