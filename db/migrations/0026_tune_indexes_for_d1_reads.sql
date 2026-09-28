-- D1 bills every row a query scans and one write per index entry
-- (docs/design-docs/d1-cost.md). Single-column indexes on low-cardinality columns lead
-- the planner to scan half a table, and unused indexes add a write to every insert.

-- Run reconciliation and share replacement filter by template and owner together.
CREATE INDEX IF NOT EXISTS idx_checklist_runs_template_owner ON checklist_runs(template_id, team_id, user_id);
DROP INDEX IF EXISTS idx_checklist_runs_template_id;
DROP INDEX IF EXISTS idx_checklist_runs_status;
DROP INDEX IF EXISTS idx_checklist_runs_assigned_to_user_id;

-- Public listings filter on is_public and sort by created_at. Owner queries use
-- idx_templates_owner and slug lookups use idx_templates_slug_unique.
CREATE INDEX IF NOT EXISTS idx_templates_public_created_at ON templates(is_public, created_at);
DROP INDEX IF EXISTS idx_templates_public;
DROP INDEX IF EXISTS idx_templates_user_id;
DROP INDEX IF EXISTS idx_templates_category;
DROP INDEX IF EXISTS idx_templates_slug;

-- No query filters audit events by actor or template versions by subject.
DROP INDEX IF EXISTS idx_audit_events_actor;
DROP INDEX IF EXISTS idx_template_versions_subject;
