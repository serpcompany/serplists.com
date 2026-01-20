-- Schema snapshot (aligned with db/migrations/*.sql)

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  username TEXT,
  affiliate_code TEXT,
  referral_count INTEGER DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);

-- Templates table
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  items TEXT NOT NULL, -- JSON array of sections/items
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
