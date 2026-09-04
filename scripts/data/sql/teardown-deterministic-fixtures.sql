-- Exact-ID cleanup for the dedicated data-safety fixture.
DELETE FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1';
DELETE FROM templates WHERE id = 'data-safety-fixture-template-v1';
DELETE FROM users WHERE id = 'data-safety-fixture-user-v1';

SELECT 'users' AS fixture_table, COUNT(*) AS fixture_rows
FROM users WHERE id = 'data-safety-fixture-user-v1'
UNION ALL
SELECT 'templates', COUNT(*)
FROM templates WHERE id = 'data-safety-fixture-template-v1'
UNION ALL
SELECT 'checklist_runs', COUNT(*)
FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1';
