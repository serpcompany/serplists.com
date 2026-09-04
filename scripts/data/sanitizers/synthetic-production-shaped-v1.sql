-- Repo-owned synthetic production-shaped profile. Contains no source values.
DELETE FROM checklist_runs WHERE id = 'rehearsal-run-v1';
DELETE FROM templates WHERE id = 'rehearsal-template-v1';
DELETE FROM users WHERE id = 'rehearsal-owner-v1';

INSERT INTO users (id, email, name, username, display_username, email_verified, auth_created_at, auth_updated_at, created_at, updated_at)
VALUES ('rehearsal-owner-v1', 'synthetic-owner-v1', NULL, NULL, NULL, 0, 1788480000000, 1788480000000, '2026-09-05 00:00:00', '2026-09-05 00:00:00');

INSERT INTO templates (id, user_id, title, description, items, version, content_version, type, owner_type, is_public, category, tags, slug, created_at, updated_at)
VALUES (
  'rehearsal-template-v1',
  'rehearsal-owner-v1',
  'Synthetic Lifecycle Template',
  'Synthetic production-shaped rehearsal data.',
  '[{"id":"rehearsal-section-v1","title":"Synthetic Section","items":[{"id":"rehearsal-item-v1","title":"Synthetic Item","isCompleted":true,"notes":"synthetic-note-v1"}]}]',
  3,
  4,
  'checklist',
  'user',
  0,
  '["Synthetic"]',
  '["rehearsal"]',
  'synthetic-lifecycle-template-v1',
  '2026-09-05 00:00:00',
  '2026-09-05 00:00:00'
);

INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at, updated_at, progress, template_version, revision, retired_items)
VALUES (
  'rehearsal-run-v1',
  'rehearsal-owner-v1',
  'rehearsal-template-v1',
  'Synthetic Lifecycle Run',
  '[{"id":"rehearsal-section-v1","title":"Synthetic Section","items":[{"id":"rehearsal-item-v1","title":"Synthetic Item","isCompleted":true,"notes":"synthetic-note-v1"}]}]',
  'completed',
  '2026-09-05 00:00:00',
  '2026-09-05 00:00:00',
  '2026-09-05 00:00:00',
  100,
  4,
  2,
  '[]'
);
