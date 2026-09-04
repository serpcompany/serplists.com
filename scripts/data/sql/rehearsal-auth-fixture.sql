-- Local-only authentication adapter for the already-sanitized rehearsal owner.
-- Never upload this credential fixture or apply it to a remote database.
UPDATE users SET email='rehearsal-owner@e2e.local', name='Rehearsal Owner', email_verified=1
WHERE id='rehearsal-owner-1';
DELETE FROM account WHERE user_id='rehearsal-owner-1';
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES ('rehearsal-account-1', 'rehearsal-owner-1', 'credential', 'rehearsal-owner-1', '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000);
