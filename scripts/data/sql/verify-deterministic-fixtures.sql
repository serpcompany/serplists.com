-- Exact reserved fixture IDs. No customer content or credentials are selected.
SELECT 'users' AS fixture_table, COUNT(*) AS fixture_rows
FROM users WHERE id = 'data-safety-fixture-user-v1'
UNION ALL
SELECT 'templates', COUNT(*)
FROM templates WHERE id = 'data-safety-fixture-template-v1'
UNION ALL
SELECT 'checklist_runs', COUNT(*)
FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1';
