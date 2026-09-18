CREATE TABLE personal_run_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_personal_run_keys_user_id ON personal_run_keys(user_id);
CREATE UNIQUE INDEX idx_personal_run_keys_key_hash_unique ON personal_run_keys(key_hash);
