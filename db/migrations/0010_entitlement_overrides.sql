-- Manual entitlements overrides (admin comp/revoke).

CREATE TABLE IF NOT EXISTS entitlement_overrides (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

