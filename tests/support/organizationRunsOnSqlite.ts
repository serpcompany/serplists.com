import type { SqliteD1 } from "./sqlite-d1";

const SEEDED_AT = "2026-10-01T00:00:00.000Z";

export function addOrganizationWithMember(database: SqliteD1, role: string): void {
  database.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
     VALUES ('team-1', 'Acme', 'acme', 'user-1', 'user-1', ?)`,
    SEEDED_AT,
  );
  database.run(
    `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
     VALUES ('member-1', 'team-1', 'user-1', ?, 'active', ?, ?, ?)`,
    role, SEEDED_AT, SEEDED_AT, SEEDED_AT,
  );
}

export function insertOrganizationRun(
  database: SqliteD1,
  run: { id: string; status: "in_progress" | "completed"; deletedAt: string | null; isPublic?: boolean },
): void {
  database.run(
    `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, completed_at, created_at,
      progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public, share_token, deleted_at)
     VALUES (?, 'user-1', 'team-1', 'template-1', 'Organization run', '[]', ?, ?, ?, ?, 0, 'user-1', 'user-1', 1, 1, '[]', ?, ?, ?)`,
    run.id, run.status, SEEDED_AT, run.status === "completed" ? SEEDED_AT : null, SEEDED_AT,
    run.isPublic ? 1 : 0, run.isPublic ? `token-${run.id}` : null, run.deletedAt,
  );
}

export function runColumns(database: SqliteD1, id: string) {
  return database.rows("SELECT deleted_at, is_public, share_token FROM checklist_runs WHERE id = ?", id);
}

export function insertOrganizationTemplate(database: SqliteD1, template: { id: string; deletedAt: string | null }): void {
  database.run(
    `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
      created_by_user_id, content_version, deleted_at)
     VALUES (?, 'user-1', 'Organization template', '[]', 0, ?, 1, 'checklist', 'team', 'team-1', 'user-1', 1, ?)`,
    template.id, SEEDED_AT, template.deletedAt,
  );
}

export function templateDeletedAt(database: SqliteD1, id: string) {
  return database.rows("SELECT deleted_at FROM templates WHERE id = ?", id);
}
