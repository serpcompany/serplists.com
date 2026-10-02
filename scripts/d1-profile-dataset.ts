export type DatasetCounts = {
  users: number;
  teams: number;
  templates: number;
  runs: number;
  likes: number;
  auditEvents: number;
  invites: number;
  templateVersions: number;
  analytics: number;
};

export const datasetCounts = (scale: number): DatasetCounts => ({
  users: 2000 * scale,
  teams: 100 * scale,
  templates: 20000 * scale,
  runs: 40000 * scale,
  likes: 20000 * scale,
  auditEvents: 40000 * scale,
  invites: 5000 * scale,
  templateVersions: 20000 * scale,
  analytics: 50000 * scale,
});

const numbers = (limit: number) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${limit})`;
const items = `'[{"id":"s1","title":"Section","items":[{"id":"i1","title":"Task one"},{"id":"i2","title":"Task two"}]}]'`;
const categories = `CASE i % 6 WHEN 0 THEN '["Marketing"]' WHEN 1 THEN '["SEO"]' WHEN 2 THEN '["Operations"]' WHEN 3 THEN '["Travel"]' WHEN 4 THEN '["Home"]' ELSE '["Events"]' END`;

export function buildSyntheticSql(counts: DatasetCounts): string {
  const syntheticUser = (expr: string) => `'synthetic-user-' || ((${expr}) % ${counts.users} + 1)`;
  return `
${numbers(counts.users)}
INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
SELECT 'synthetic-user-' || i, 'synthetic' || i || '@example.test', 'Synthetic User ' || i,
  CASE WHEN i % 2 = 0 THEN 'synth_' || i END, 1, datetime('now', '-' || (i % 365) || ' days'), datetime('now') FROM n;

${numbers(counts.teams)}
INSERT INTO teams (id, name, slug, created_by_user_id, billing_owner_user_id, created_at, updated_at)
SELECT 'synthetic-team-' || i, 'Synthetic Org ' || i, 'synthetic-org-' || i, ${syntheticUser("i * 10")}, ${syntheticUser("i * 10")},
  datetime('now'), datetime('now') FROM n;

${numbers(counts.teams * 10)}
INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
SELECT 'synthetic-member-' || i, 'synthetic-team-' || ((i - 1) / 10 + 1), ${syntheticUser("i")},
  CASE WHEN i % 10 = 1 THEN 'owner' ELSE 'editor' END, 'active', datetime('now'), datetime('now'), datetime('now') FROM n;

${numbers(counts.templates)}
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at, updated_at, slug,
  version, type, owner_type, team_id, created_by_user_id, deleted_at, content_version)
SELECT 'synthetic-template-' || i,
  CASE WHEN i % 20 = 0 OR i % 50 = 0 THEN 'user-1' ELSE ${syntheticUser("i")} END,
  'Synthetic template ' || i, 'A synthetic template for D1 profiling.', ${items},
  CASE WHEN i % 20 = 0 THEN 0 WHEN i % 5 < 2 THEN 1 ELSE 0 END, ${categories}, '["synthetic"]',
  datetime('now', '-' || (i % 500) || ' days'), datetime('now', '-' || (i % 100) || ' days'), 'synthetic-template-' || i,
  1, 'checklist', CASE WHEN i % 20 = 0 THEN 'team' ELSE 'user' END,
  CASE WHEN i % 20 = 0 THEN 'team-seed-growth' END,
  CASE WHEN i % 20 = 0 OR i % 50 = 0 THEN 'user-1' ELSE ${syntheticUser("i")} END,
  CASE WHEN i % 20 = 1 THEN datetime('now') END, 1 FROM n;

${numbers(counts.runs)}
INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, completed_at, created_at, updated_at,
  progress, is_public, share_token, team_id, created_by_user_id, deleted_at, template_version, revision, retired_items)
SELECT 'synthetic-run-' || i,
  CASE WHEN i % 40 = 0 THEN 'user-1' ELSE ${syntheticUser("i * 3")} END,
  'synthetic-template-' || (i % ${counts.templates} + 1), 'Synthetic run ' || i, ${items},
  CASE WHEN i % 3 = 0 THEN 'completed' ELSE 'in_progress' END,
  datetime('now', '-' || (i % 300) || ' days'), CASE WHEN i % 3 = 0 THEN datetime('now') END,
  datetime('now', '-' || (i % 300) || ' days'), datetime('now'),
  CASE WHEN i % 3 = 0 THEN 100 ELSE 50 END, CASE WHEN i % 50 = 0 THEN 1 ELSE 0 END,
  CASE WHEN i % 50 = 0 THEN 'synthetic-share-' || i END,
  CASE WHEN i % 10 = 0 THEN 'team-seed-growth' END,
  CASE WHEN i % 40 = 0 THEN 'user-1' ELSE ${syntheticUser("i * 3")} END,
  CASE WHEN i % 25 = 7 THEN datetime('now') END, 1, 1, '[]' FROM n;

${numbers(counts.likes)}
INSERT OR IGNORE INTO template_likes (user_id, template_id, created_at)
SELECT ${syntheticUser("i")}, 'synthetic-template-' || ((i * 7) % ${counts.templates} + 1), datetime('now') FROM n;

${numbers(counts.auditEvents)}
INSERT INTO audit_events (id, actor_user_id, subject_type, subject_id, resource_type, resource_id, action, created_at)
SELECT 'synthetic-audit-' || i, ${syntheticUser("i")},
  CASE WHEN i % 20 = 0 THEN 'team' ELSE 'user' END,
  CASE WHEN i % 20 = 0 THEN 'team-seed-growth' ELSE ${syntheticUser("i")} END,
  'template', 'synthetic-template-' || (i % ${counts.templates} + 1), 'template.updated',
  datetime('now', '-' || (i % 200) || ' days') FROM n;

${numbers(counts.invites)}
INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, revoked_at, created_at, updated_at)
SELECT 'synthetic-invite-' || i, 'synthetic-team-' || (i % ${counts.teams} + 1), 'invitee' || i || '@example.test', 'viewer',
  'synthetic-invite-hash-' || i, ${syntheticUser("i * 10")}, datetime('now', '-' || (i % 60 + 1) || ' days'),
  CASE WHEN i % 3 = 0 THEN datetime('now', '-' || (i % 60 + 2) || ' days') END,
  datetime('now', '-' || (i % 60 + 8) || ' days'), datetime('now') FROM n;

${numbers(counts.templateVersions)}
INSERT INTO template_versions (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
SELECT 'synthetic-version-' || i, 'synthetic-template-' || (i % ${counts.templates} + 1), i / ${counts.templates} + 1,
  ${syntheticUser("i")}, 'user', ${syntheticUser("i")}, '{}', datetime('now', '-' || (i % 200) || ' days') FROM n;

${numbers(300)}
INSERT INTO template_versions (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
SELECT 'synthetic-hot-version-' || i, 'synthetic-template-50', i + 1, 'user-1', 'user', 'user-1', '{}',
  datetime('now', '-' || i || ' minutes') FROM n;

UPDATE templates SET version = (SELECT MAX(v.version) FROM template_versions v WHERE v.template_id = templates.id)
WHERE id LIKE 'synthetic-template-%'
  AND version < (SELECT MAX(v.version) FROM template_versions v WHERE v.template_id = templates.id);

${numbers(300)}
INSERT INTO audit_events (id, actor_user_id, subject_type, subject_id, resource_type, resource_id, action, diff_json, created_at)
SELECT 'synthetic-hot-audit-' || i, 'user-1', 'user', 'user-1', 'checklist_run', 'synthetic-run-40', 'checklist_run.updated',
  '{"items":"' || printf('%.2000c', 'x') || '"}', datetime('now', '-' || i || ' minutes') FROM n;

${numbers(counts.analytics)}
INSERT INTO usage_analytics (id, user_id, action, resource_id, created_at)
SELECT 'synthetic-event-' || i, ${syntheticUser("i")}, 'template_view', 'synthetic-template-' || (i % ${counts.templates} + 1),
  datetime('now', '-' || (i % 90) || ' days') FROM n;
`;
}
