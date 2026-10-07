CREATE INDEX IF NOT EXISTS idx_checklist_runs_template_owner ON checklist_runs(template_id, team_id, user_id);
DROP INDEX IF EXISTS idx_checklist_runs_template_id;
DROP INDEX IF EXISTS idx_checklist_runs_status;
DROP INDEX IF EXISTS idx_checklist_runs_assigned_to_user_id;

CREATE INDEX IF NOT EXISTS idx_templates_public_created_at ON templates(is_public, created_at);
DROP INDEX IF EXISTS idx_templates_public;
DROP INDEX IF EXISTS idx_templates_user_id;
DROP INDEX IF EXISTS idx_templates_category;
DROP INDEX IF EXISTS idx_templates_slug;

DROP INDEX IF EXISTS idx_audit_events_actor;
DROP INDEX IF EXISTS idx_template_versions_subject;
