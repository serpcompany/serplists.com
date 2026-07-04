-- Schema snapshot for reference and local inspection.
-- `db/migrations/*.sql` remains the source of truth for schema changes.

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  username TEXT,
  display_username TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  auth_created_at INTEGER,
  auth_updated_at INTEGER,
  affiliate_code TEXT,
  referral_count INTEGER DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);

-- Better Auth tables
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX account_user_id_idx ON account(user_id);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON session(user_id);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX verification_identifier_idx ON verification(identifier);

-- Templates table
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  items TEXT NOT NULL, -- JSON array of sections/items
  version INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL DEFAULT 'checklist',
  seo_title TEXT,
  seo_description TEXT,
  rules TEXT, -- JSON array of template rules
  owner_type TEXT NOT NULL DEFAULT 'user',
  team_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  is_public INTEGER DEFAULT 0,
  category TEXT,
  tags TEXT, -- JSON array of tags
  slug TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_public ON templates(is_public);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_slug ON templates(slug);
CREATE UNIQUE INDEX idx_templates_slug_unique ON templates(slug);
CREATE INDEX idx_templates_owner ON templates(owner_type, user_id, team_id);
CREATE INDEX idx_templates_team_id ON templates(team_id);

-- Checklist runs/instances
CREATE TABLE checklist_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,
  template_id TEXT,
  title TEXT NOT NULL,
  items TEXT NOT NULL, -- JSON array with completion status
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_by_user_id TEXT,
  assigned_to_user_id TEXT,
  started_by_user_id TEXT,
  completed_by_user_id TEXT,
  is_public INTEGER DEFAULT 0,
  share_token TEXT,
  share_expires_at TEXT,
  share_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  progress INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE INDEX idx_checklist_runs_user_id ON checklist_runs(user_id);
CREATE INDEX idx_checklist_runs_template_id ON checklist_runs(template_id);
CREATE INDEX idx_checklist_runs_status ON checklist_runs(status);
CREATE INDEX idx_checklist_runs_team_id ON checklist_runs(team_id);
CREATE INDEX idx_checklist_runs_assigned_to_user_id ON checklist_runs(assigned_to_user_id);

-- Template likes
CREATE TABLE template_likes (
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

-- Analytics/Usage tracking
CREATE TABLE usage_analytics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- template_created, checklist_started, checklist_completed
  resource_id TEXT,
  metadata TEXT, -- JSON for additional data
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_analytics_user_id ON usage_analytics(user_id);
CREATE INDEX idx_usage_analytics_action ON usage_analytics(action);

-- Stripe billing tables
CREATE TABLE stripe_customers (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE stripe_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at INTEGER,
  trial_end INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX stripe_subscriptions_user_id_idx ON stripe_subscriptions(user_id);
CREATE INDEX stripe_subscriptions_customer_id_idx ON stripe_subscriptions(stripe_customer_id);

CREATE TABLE stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created INTEGER NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT NOT NULL,
  error TEXT
);

-- Manual entitlements overrides
CREATE TABLE entitlement_overrides (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Team/workspace foundations
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
CREATE UNIQUE INDEX idx_team_members_active_owner_unique ON team_members(team_id) WHERE role = 'owner' AND status = 'active';

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

-- Immutable application history
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
