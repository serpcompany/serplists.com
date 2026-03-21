UPDATE users
SET password_hash = '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',
    auth_updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000,
    updated_at = datetime('now')
WHERE email IN ('admin@test.com', 'john@test.com', 'jane@test.com', 'bob@test.com');

UPDATE account
SET password = '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE provider_id = 'credential'
  AND user_id IN (
    SELECT id
    FROM users
    WHERE email IN ('admin@test.com', 'john@test.com', 'jane@test.com', 'bob@test.com')
  );
