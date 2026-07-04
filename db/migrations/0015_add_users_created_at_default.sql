-- Ensure Better Auth inserts succeed by providing a default for users.created_at.
-- SQLite doesn't support altering a default directly, so rebuild the users table.
-- D1 remote migrations reject explicit BEGIN/COMMIT statements in this path.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS users_new;

CREATE TABLE users_new (
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

INSERT INTO users_new (
  id,
  email,
  password_hash,
  name,
  avatar_url,
  username,
  display_username,
  email_verified,
  auth_created_at,
  auth_updated_at,
  affiliate_code,
  referral_count,
  total_earnings,
  created_at,
  updated_at
)
SELECT
  id,
  email,
  password_hash,
  name,
  avatar_url,
  username,
  display_username,
  email_verified,
  auth_created_at,
  auth_updated_at,
  affiliate_code,
  referral_count,
  total_earnings,
  created_at,
  updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);

PRAGMA foreign_keys=ON;
