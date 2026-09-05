-- Deliberately sensitive-looking, wholly fictional Wrangler data-only export fixture.
-- Tests prove that no literal below reaches the sanitized artifact or its reports.
PRAGMA defer_foreign_keys=TRUE;
-- A complete synthetic source ledger is part of this sanitizer fixture. OR IGNORE
-- keeps the fixture safe when loaded after an already-ledgered local replay.
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (1, '0001_initial_schema.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (2, '0002_add_slug_to_templates.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (3, '0002_add_username_and_profiles.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (4, '0003_unique_template_slugs.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (5, '0004_remove_affiliate_and_pages.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (6, '0005_backfill_template_slugs.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (7, '0007_add_checklist_run_progress.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (8, '0008_better_auth.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (9, '0009_stripe_billing.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (10, '0010_entitlement_overrides.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (11, '0011_add_template_version.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (12, '0012_cleanup_junk_templates.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (13, '0013_add_template_type.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (14, '0014_make_users_password_hash_nullable.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (15, '0015_add_users_created_at_default.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (16, '0016_users_password_hash_nullable_live_safe.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (17, '0017_add_checklist_run_sharing_fields.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (18, '0018_rename_test_users.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (19, '0019_add_template_seo_fields.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (20, '0020_add_template_rules.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (21, '0021_add_teams_audit_history.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (22, '0022_enforce_single_active_team_owner.sql', '2026-09-05');
INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES (23, '0023_add_sitemap_revision_state.sql', '2026-09-05');
INSERT INTO users (id, email, password_hash, name, username, email_verified, auth_created_at, auth_updated_at, created_at, updated_at)
VALUES ('8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'private.person@example.com', 'fixture-password-material', 'Private Person', 'private-person', 1, 1700000000000, 1700000000000, '2024-01-01', '2024-01-02');
INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, password)
VALUES ('private-account-id', 'private-provider-account', 'credential', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'private-access-token', 'private-refresh-token', 'private-account-password');
INSERT INTO session (id, expires_at, token, ip_address, user_agent, user_id)
VALUES ('private-session-id', 1999999999999, 'private-session-token', '192.0.2.10', 'Private Browser', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67');

INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at, updated_at, slug, version, type, owner_type)
VALUES ('private-template-flat', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'Customer Flat Plan', 'Confidential launch content', '[{"title":"Private Flat Task","isCompleted":false}]', 0, '["Private Category"]', '["secret-tag"]', '2024-01-01', '2024-01-02', 'customer-flat-plan', 2, 'checklist', 'user');
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at, updated_at, slug, version, type, owner_type)
VALUES ('private-template-nested', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'Customer Nested Plan', 'Contains private notes', '[{"title":"Private Section","customerNumericId":987654321012345,"order":17,"items":[{"id":987654321012345,"title":"Private Task","isCompleted":true,"notes":"Customer secret note","subItems":[{"title":"Private Direct Child"}],"contents":[{"title":"Private Content","subItems":[{"title":"Private Content Child"}]}]},{"title":"Missing Identity Edge"}]}]', 1, '["Another Private Category"]', '["customer-only"]', '2024-02-01', '2024-02-02', 'customer-nested-plan', 7, 'checklist', 'user');

INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, completed_at, created_at, updated_at, progress, is_public, share_token)
VALUES ('private-run-flat', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'private-template-flat', 'Customer Flat Run', '[{"title":"Private Flat Task","isCompleted":false}]', 'in_progress', '2024-03-01', NULL, '2024-03-01', '2024-03-02', 35, 0, 'private-share-token');
INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, completed_at, created_at, updated_at, progress, is_public, share_token)
VALUES ('private-run-nested', '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67', 'private-template-nested', 'Customer Nested Run', '[{"title":"Private Section","items":[{"title":"Private Task","isCompleted":true,"notes":"Customer run secret","subItems":[{"title":"Private Direct Child"}],"contents":[{"title":"Private Content","subItems":[{"title":"Private Content Child"}]}]}]}]', 'completed', '2024-04-01', '2024-04-02', '2024-04-01', '2024-04-02', 100, 1, 'private-public-share-token');
