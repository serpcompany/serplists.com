-- Valid only after 0024_safe_template_evolution.sql appears in d1_migrations.
SELECT 'templates_invalid_content_version' AS invariant, COUNT(*) AS total_rows FROM templates WHERE content_version < 1;
SELECT 'runs_invalid_template_version' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE template_version < 0;
SELECT 'runs_invalid_revision' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE revision < 1;
SELECT 'runs_invalid_retired_json' AS invariant, COUNT(*) AS total_rows FROM checklist_runs WHERE NOT json_valid(retired_items);
