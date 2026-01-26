-- Schema snapshot (aligned with db/migrations/*.sql)

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
  is_public INTEGER DEFAULT 0,
  category TEXT,
  tags TEXT, -- JSON array of tags
  slug TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_public ON templates(is_public);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_slug ON templates(slug);
CREATE UNIQUE INDEX idx_templates_slug_unique ON templates(slug);

-- Checklist runs/instances
CREATE TABLE checklist_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT NOT NULL,
  items TEXT NOT NULL, -- JSON array with completion status
  status TEXT DEFAULT 'in_progress',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  progress INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE INDEX idx_checklist_runs_user_id ON checklist_runs(user_id);
CREATE INDEX idx_checklist_runs_template_id ON checklist_runs(template_id);
CREATE INDEX idx_checklist_runs_status ON checklist_runs(status);

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
