-- Dedicated deterministic data-safety fixture. No credential or session is created.
-- This identity is reserved for local, staging, and isolated rehearsal only.
DELETE FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1';
DELETE FROM templates WHERE id = 'data-safety-fixture-template-v1';
DELETE FROM users WHERE id = 'data-safety-fixture-user-v1';

INSERT INTO users (
  id, email, name, username, display_username, email_verified,
  auth_created_at, auth_updated_at, created_at, updated_at
) VALUES (
  'data-safety-fixture-user-v1',
  'data-safety-fixture@staging.serplists.invalid',
  'Data Safety Fixture',
  'data-safety-fixture-v1',
  'data-safety-fixture-v1',
  0,
  1788451200000,
  1788451200000,
  '2026-09-04 00:00:00',
  '2026-09-04 00:00:00'
);

INSERT INTO templates (
  id, user_id, title, description, items, version, content_version, type,
  owner_type, is_public, category, tags, slug, created_at, updated_at
) VALUES (
  'data-safety-fixture-template-v1',
  'data-safety-fixture-user-v1',
  'Data Safety Fixture Template',
  'Controlled fixture for migration and visibility checks.',
  '[{"id":"data-safety-section-v1","title":"Verification","items":[{"id":"data-safety-item-v1","title":"Data remains visible","isCompleted":false}]}]',
  1,
  1,
  'checklist',
  'user',
  0,
  '["Operations"]',
  '["data-safety-fixture"]',
  'data-safety-fixture-template-v1',
  '2026-09-04 00:00:00',
  '2026-09-04 00:00:00'
);

INSERT INTO checklist_runs (
  id, user_id, template_id, title, items, status, started_at, created_at,
  updated_at, progress, template_version, revision, retired_items
) VALUES (
  'data-safety-fixture-run-v1',
  'data-safety-fixture-user-v1',
  'data-safety-fixture-template-v1',
  'Data Safety Fixture Run',
  '[{"id":"data-safety-section-v1","title":"Verification","items":[{"id":"data-safety-item-v1","title":"Data remains visible","isCompleted":false}]}]',
  'in_progress',
  '2026-09-04 00:00:00',
  '2026-09-04 00:00:00',
  '2026-09-04 00:00:00',
  0,
  1,
  1,
  '[]'
);

SELECT 'users' AS fixture_table, COUNT(*) AS fixture_rows
FROM users WHERE id = 'data-safety-fixture-user-v1'
UNION ALL
SELECT 'templates', COUNT(*)
FROM templates WHERE id = 'data-safety-fixture-template-v1'
UNION ALL
SELECT 'checklist_runs', COUNT(*)
FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1';
