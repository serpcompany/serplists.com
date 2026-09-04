-- GENERATED FILE. DO NOT EDIT BY HAND.
-- Derived by scripts/data/generate-schema-snapshot.ts from the complete Wrangler migration chain.

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

CREATE TABLE checklist_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT NOT NULL,
  items TEXT NOT NULL, -- JSON array with completion status
  status TEXT DEFAULT 'in_progress', -- in_progress, completed, archived
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT, progress INTEGER DEFAULT 0, is_public INTEGER DEFAULT 0, share_token TEXT, share_expires_at TEXT, share_used_at TEXT, team_id TEXT REFERENCES teams(id) ON DELETE SET NULL, created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, started_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, deleted_at TEXT, template_version INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1, retired_items TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE TABLE entitlement_overrides (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

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

CREATE TABLE sitemap_category_revisions (
  category TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);

CREATE TABLE sitemap_owner_revisions (
  user_id TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);

CREATE TABLE sitemap_profile_revisions (
  user_id TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);

CREATE TABLE sitemap_revisions (
  kind TEXT PRIMARY KEY CHECK (kind IN ('profiles', 'templates', 'categories')),
  revised_at TEXT NOT NULL
);

CREATE TABLE sitemap_shard_revisions (
  kind TEXT NOT NULL,
  page INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  revised_at TEXT NOT NULL,
  PRIMARY KEY (kind, page)
);

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

CREATE TABLE stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created INTEGER NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT NOT NULL,
  error TEXT
);

CREATE TABLE team_entitlement_overrides (
  team_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

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

CREATE TABLE template_likes (
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

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

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  items TEXT NOT NULL, -- JSON array of checklist items
  is_public INTEGER DEFAULT 0,
  category TEXT,
  tags TEXT, -- JSON array of tags
  created_at TEXT NOT NULL,
  updated_at TEXT, slug TEXT, version INTEGER NOT NULL DEFAULT 1, type TEXT NOT NULL DEFAULT 'checklist', seo_title TEXT, seo_description TEXT, rules TEXT, owner_type TEXT NOT NULL DEFAULT 'user', team_id TEXT REFERENCES teams(id) ON DELETE SET NULL, created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, deleted_at TEXT, content_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE usage_analytics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- template_created, checklist_started, checklist_completed
  resource_id TEXT,
  metadata TEXT, -- JSON for additional data
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE "users" (
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

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX account_user_id_idx ON account(user_id);

CREATE INDEX idx_audit_events_actor ON audit_events(actor_user_id, created_at);

CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id, created_at);

CREATE INDEX idx_audit_events_subject ON audit_events(subject_type, subject_id, created_at);

CREATE INDEX idx_checklist_runs_assigned_to_user_id ON checklist_runs(assigned_to_user_id);

CREATE INDEX idx_checklist_runs_share_token ON checklist_runs(share_token);

CREATE INDEX idx_checklist_runs_status ON checklist_runs(status);

CREATE INDEX idx_checklist_runs_team_id ON checklist_runs(team_id);

CREATE INDEX idx_checklist_runs_template_id ON checklist_runs(template_id);

CREATE INDEX idx_checklist_runs_user_id ON checklist_runs(user_id);

CREATE INDEX idx_team_invites_email ON team_invites(email);

CREATE INDEX idx_team_invites_team_email ON team_invites(team_id, email);

CREATE UNIQUE INDEX idx_team_invites_token_hash_unique ON team_invites(token_hash);

CREATE UNIQUE INDEX idx_team_members_active_owner_unique
  ON team_members(team_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX idx_team_members_team_role ON team_members(team_id, role);

CREATE UNIQUE INDEX idx_team_members_team_user_unique ON team_members(team_id, user_id);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);

CREATE INDEX idx_teams_created_by_user_id ON teams(created_by_user_id);

CREATE UNIQUE INDEX idx_teams_slug_unique ON teams(slug) WHERE slug IS NOT NULL;

CREATE INDEX idx_template_versions_subject ON template_versions(subject_type, subject_id, created_at);

CREATE UNIQUE INDEX idx_template_versions_template_version_unique ON template_versions(template_id, version);

CREATE INDEX idx_templates_category ON templates(category);

CREATE INDEX idx_templates_owner ON templates(owner_type, user_id, team_id);

CREATE INDEX idx_templates_public ON templates(is_public);

CREATE INDEX idx_templates_slug ON templates(slug);

CREATE UNIQUE INDEX idx_templates_slug_unique ON templates(slug);

CREATE INDEX idx_templates_team_id ON templates(team_id);

CREATE INDEX idx_templates_user_id ON templates(user_id);

CREATE INDEX idx_usage_analytics_action ON usage_analytics(action);

CREATE INDEX idx_usage_analytics_user_id ON usage_analytics(user_id);

CREATE INDEX idx_users_email ON users(email);

CREATE UNIQUE INDEX idx_users_username ON users(username);

CREATE INDEX session_user_id_idx ON session(user_id);

CREATE INDEX stripe_subscriptions_customer_id_idx ON stripe_subscriptions(stripe_customer_id);

CREATE INDEX stripe_subscriptions_user_id_idx ON stripe_subscriptions(user_id);

CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TRIGGER sitemap_owner_users_insert AFTER INSERT ON users BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,COALESCE(NEW.updated_at,NEW.created_at));
END;

CREATE TRIGGER sitemap_templates_delete AFTER DELETE ON templates
WHEN OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;

CREATE TRIGGER sitemap_templates_insert AFTER INSERT ON templates
WHEN NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;

CREATE TRIGGER sitemap_templates_update AFTER UPDATE ON templates
WHEN (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_profile_revisions VALUES(NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;

CREATE TRIGGER sitemap_users_delete BEFORE DELETE ON users BEGIN
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='profiles' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
    (kind='templates' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL)) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;

CREATE TRIGGER sitemap_users_delete_cleanup AFTER DELETE ON users BEGIN
  DELETE FROM sitemap_profile_revisions WHERE user_id=OLD.id;
  DELETE FROM sitemap_owner_revisions WHERE user_id=OLD.id;
END;

CREATE TRIGGER sitemap_users_insert AFTER INSERT ON users
WHEN LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30
 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*' BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles';
END;

CREATE TRIGGER sitemap_users_update_owner AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='templates' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL) AND (
      (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
      (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*')
    )) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;

CREATE TRIGGER sitemap_users_update_profile AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name OR OLD.avatar_url IS NOT NEW.avatar_url BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles' AND (
    (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
    (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*')
  );
END;
