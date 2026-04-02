-- Local-only companion seed for the official SERP publisher account.
-- This keeps the remote official seed unchanged while making `serp` usable
-- as a dev persona for local import/public-profile verification.

INSERT OR IGNORE INTO account (
  id,
  account_id,
  provider_id,
  user_id,
  password,
  created_at,
  updated_at
) VALUES (
  lower(hex(randomblob(16))),
  'serp-user',
  'credential',
  'serp-user',
  '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

UPDATE users
SET password_hash = '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',
    email_verified = 1,
    auth_updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000,
    updated_at = datetime('now')
WHERE id = 'serp-user';

INSERT INTO entitlement_overrides (
  user_id,
  plan,
  expires_at,
  note,
  created_at,
  updated_at
) VALUES (
  'serp-user',
  'pro',
  NULL,
  'Local official publisher persona: SERP (Pro)',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id) DO UPDATE SET
  plan = excluded.plan,
  expires_at = excluded.expires_at,
  note = excluded.note,
  updated_at = datetime('now');
