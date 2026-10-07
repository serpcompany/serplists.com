ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN auth_created_at INTEGER;
ALTER TABLE users ADD COLUMN auth_updated_at INTEGER;
ALTER TABLE users ADD COLUMN display_username TEXT;

UPDATE users
SET name = COALESCE(
  name,
  CASE
    WHEN instr(email, '@') > 1 THEN substr(email, 1, instr(email, '@') - 1)
    ELSE email
  END
)
WHERE name IS NULL;

UPDATE users
SET display_username = COALESCE(display_username, username)
WHERE display_username IS NULL;

UPDATE users
SET auth_created_at = CAST(strftime('%s', created_at) AS INTEGER) * 1000
WHERE auth_created_at IS NULL;

UPDATE users
SET auth_updated_at = COALESCE(
  CAST(strftime('%s', updated_at) AS INTEGER) * 1000,
  auth_created_at
)
WHERE auth_updated_at IS NULL;

CREATE TABLE IF NOT EXISTS account (
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

CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS session (
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

CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  users.id,
  'credential',
  users.id,
  users.password_hash,
  users.auth_created_at,
  users.auth_updated_at
FROM users
WHERE users.password_hash IS NOT NULL
  AND users.password_hash != ''
  AND NOT EXISTS (
    SELECT 1 FROM account a
    WHERE a.provider_id = 'credential' AND a.account_id = users.id
  );
