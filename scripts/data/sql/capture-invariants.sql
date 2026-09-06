-- Aggregate-only evidence. Never select customer content or direct identifiers.
SELECT 'foreign_key_violations' AS invariant, COUNT(*) AS total_rows FROM pragma_foreign_key_check;
SELECT 'users' AS invariant, COUNT(*) AS total_rows FROM users;
SELECT 'templates' AS invariant, COUNT(*) AS total_rows FROM templates;
SELECT 'templates_active' AS invariant, COUNT(*) AS total_rows FROM templates WHERE deleted_at IS NULL;
SELECT 'templates_deleted' AS invariant, COUNT(*) AS total_rows FROM templates WHERE deleted_at IS NOT NULL;
SELECT 'templates_invalid_json' AS invariant, COUNT(*) AS total_rows FROM templates WHERE NOT json_valid(items);
SELECT 'templates_invalid_version' AS invariant, COUNT(*) AS total_rows FROM templates WHERE version < 1;
SELECT 'template_owners' AS invariant, COUNT(DISTINCT user_id) AS total_rows FROM templates;
SELECT 'runs' AS invariant, COUNT(*) AS total_rows FROM checklist_runs;
SELECT 'runs_active' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE deleted_at IS NULL;
SELECT 'runs_deleted' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE deleted_at IS NOT NULL;
SELECT 'runs_invalid_json' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE NOT json_valid(items);
SELECT 'run_owners' AS invariant, COUNT(DISTINCT user_id) AS total_rows FROM checklist_runs;
SELECT 'orphaned_templates' AS invariant, COUNT(*) AS total_rows FROM templates t LEFT JOIN users u ON u.id = t.user_id WHERE u.id IS NULL;
SELECT 'orphaned_runs' AS invariant, COUNT(*) AS total_rows FROM checklist_runs r LEFT JOIN users u ON u.id = r.user_id WHERE u.id IS NULL;
