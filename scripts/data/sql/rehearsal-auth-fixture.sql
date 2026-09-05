-- Local-only authentication adapter for every already-sanitized principal.
-- Never upload this credential fixture or apply it to a remote database.
UPDATE users SET email=id || '@e2e.local', name='Rehearsal Owner', email_verified=1
WHERE id GLOB 'rehearsal-owner-[0-9]*';
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT 'rehearsal-account-' || id, id, 'credential', id, '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000 FROM users WHERE id GLOB 'rehearsal-owner-[0-9]*';
