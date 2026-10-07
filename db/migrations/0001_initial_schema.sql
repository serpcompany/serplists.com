CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  items TEXT NOT NULL,
  is_public INTEGER DEFAULT 0,
  category TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_public ON templates(is_public);
CREATE INDEX idx_templates_category ON templates(category);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT NOT NULL,
  items TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE INDEX idx_checklist_runs_user_id ON checklist_runs(user_id);
CREATE INDEX idx_checklist_runs_template_id ON checklist_runs(template_id);
CREATE INDEX idx_checklist_runs_status ON checklist_runs(status);

CREATE TABLE IF NOT EXISTS template_likes (
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_analytics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_analytics_user_id ON usage_analytics(user_id);
CREATE INDEX idx_usage_analytics_action ON usage_analytics(action);