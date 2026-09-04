import { createHash } from "node:crypto";
import { listMigrationFiles, replayMigrations } from "./schema-contract";

type MatrixDatabase = ReturnType<typeof replayMigrations>;

const createdAt = "2026-09-05T00:00:00Z";

function runItems(note: string, completed: boolean) {
  return JSON.stringify([{
    id: "matrix-section",
    title: "Synthetic Section",
    items: [{
      id: "matrix-item",
      title: "Synthetic Item",
      isCompleted: completed,
      notes: note,
      contents: [{
        type: "subItems",
        value: "",
        subItems: [{ id: "matrix-sub-item", title: "Synthetic Sub-item", isCompleted: completed }],
      }],
    }],
  }]);
}

function seed(database: MatrixDatabase) {
  const insertUser = database.prepare(
    "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
  );
  insertUser.run("matrix-owner-a", "synthetic-owner-a", createdAt);
  insertUser.run("matrix-owner-b", "synthetic-owner-b", createdAt);

  const insertTemplate = database.prepare(`
    INSERT INTO templates (
      id, user_id, title, items, version, owner_type, is_public, created_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, 'user', 0, ?, ?)
  `);
  insertTemplate.run(
    "matrix-template-active",
    "matrix-owner-a",
    "Synthetic Active Template",
    runItems("template-note", false),
    3,
    createdAt,
    null,
  );
  insertTemplate.run(
    "matrix-template-deleted",
    "matrix-owner-b",
    "Synthetic Deleted Template",
    runItems("deleted-template-note", false),
    2,
    createdAt,
    "2026-09-01T00:00:00Z",
  );

  const insertRun = database.prepare(`
    INSERT INTO checklist_runs (
      id, user_id, template_id, title, items, status, started_at, completed_at,
      created_at, deleted_at, progress, is_public
    ) VALUES (?, 'matrix-owner-a', 'matrix-template-active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRun.run("matrix-run-active-25", "Active 25", runItems("note-25", true), "in_progress", createdAt, null, createdAt, null, 25, 0);
  insertRun.run("matrix-run-active-75", "Active 75", runItems("note-75", false), "in_progress", createdAt, null, createdAt, null, 75, 0);
  insertRun.run("matrix-run-completed", "Completed", runItems("completed-note", true), "completed", createdAt, createdAt, createdAt, null, 100, 0);
  insertRun.run("matrix-run-shared", "Shared", runItems("shared-note", false), "in_progress", createdAt, null, createdAt, null, 50, 1);
  insertRun.run("matrix-run-archived", "Archived", runItems("archived-note", true), "in_progress", createdAt, null, createdAt, "2026-09-01T00:00:00Z", 100, 0);
}

function scalar(database: MatrixDatabase, sql: string) {
  return Number((database.prepare(sql).get() as { value: number }).value);
}

function stripIdentityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdentityFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "id")
      .map(([key, entry]) => [key, stripIdentityFields(entry)]),
  );
}

function preservationHash(rows: unknown) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function collectStructureIdentities(sourceId: string, sections: unknown[]) {
  const identities: Array<{ sourceId: string; kind: "section" | "item" | "subItem"; path: string; id: string }> = [];
  sections.forEach((section, sectionIndex) => {
    const sectionRecord = asRecord(section);
    if (typeof sectionRecord.id === "string") {
      identities.push({ sourceId, kind: "section", path: `${sectionIndex}`, id: sectionRecord.id });
    }
    (Array.isArray(sectionRecord.items) ? sectionRecord.items : []).forEach((item, itemIndex) => {
      const itemRecord = asRecord(item);
      if (typeof itemRecord.id === "string") {
        identities.push({ sourceId, kind: "item", path: `${sectionIndex}.${itemIndex}`, id: itemRecord.id });
      }
      const subItems = [
        ...(Array.isArray(itemRecord.subItems) ? itemRecord.subItems : []),
        ...(Array.isArray(itemRecord.contents)
          ? itemRecord.contents.flatMap((content) => {
              const contentRecord = asRecord(content);
              return Array.isArray(contentRecord.subItems) ? contentRecord.subItems : [];
            })
          : []),
      ];
      subItems.forEach((subItem, subItemIndex) => {
        const subItemRecord = asRecord(subItem);
        if (typeof subItemRecord.id === "string") {
          identities.push({
            sourceId,
            kind: "subItem",
            path: `${sectionIndex}.${itemIndex}.${subItemIndex}`,
            id: subItemRecord.id,
          });
        }
      });
    });
  });
  return identities;
}

function capture(database: MatrixDatabase, after0024: boolean) {
  const rows = {
    users: scalar(database, "SELECT COUNT(*) AS value FROM users WHERE id LIKE 'matrix-%'"),
    templates: scalar(database, "SELECT COUNT(*) AS value FROM templates WHERE id LIKE 'matrix-%'"),
    runs: scalar(database, "SELECT COUNT(*) AS value FROM checklist_runs WHERE id LIKE 'matrix-%'"),
  };
  const owners = {
    templateOwners: scalar(database, "SELECT COUNT(DISTINCT user_id) AS value FROM templates WHERE id LIKE 'matrix-%'"),
    runOwners: scalar(database, "SELECT COUNT(DISTINCT user_id) AS value FROM checklist_runs WHERE id LIKE 'matrix-%'"),
  };
  const activeDeleted = {
    activeTemplates: scalar(database, "SELECT COUNT(*) AS value FROM templates WHERE id LIKE 'matrix-%' AND deleted_at IS NULL"),
    deletedTemplates: scalar(database, "SELECT COUNT(*) AS value FROM templates WHERE id LIKE 'matrix-%' AND deleted_at IS NOT NULL"),
    activeRuns: scalar(database, "SELECT COUNT(*) AS value FROM checklist_runs WHERE id LIKE 'matrix-%' AND deleted_at IS NULL"),
    deletedRuns: scalar(database, "SELECT COUNT(*) AS value FROM checklist_runs WHERE id LIKE 'matrix-%' AND deleted_at IS NOT NULL"),
  };
  const activeRuns = database.prepare(`
    SELECT id, progress, items
    FROM checklist_runs
    WHERE id IN ('matrix-run-active-25', 'matrix-run-active-75')
    ORDER BY id
  `).all().map((row) => ({
    id: String(row.id),
    progress: Number(row.progress),
    note: JSON.parse(String(row.items))[0].items[0].notes,
  }));
  const lifecycle = database.prepare(`
    SELECT id, status, is_public, deleted_at${after0024 ? ", template_version" : ""}
    FROM checklist_runs
    WHERE id IN ('matrix-run-completed', 'matrix-run-shared', 'matrix-run-archived')
    ORDER BY id
  `).all().map((row) => ({
    id: String(row.id),
    status: String(row.status),
    isPublic: Number(row.is_public),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    ...(after0024 ? { templateVersion: Number(row.template_version) } : {}),
  }));
  const preservedRows = {
    templates: database.prepare(`
      SELECT id, user_id, deleted_at, items
      FROM templates WHERE id LIKE 'matrix-template-%' ORDER BY id
    `).all().map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
      normalizedItems: stripIdentityFields(JSON.parse(String(row.items))),
    })),
    runs: database.prepare(`
      SELECT id, user_id, template_id, status, is_public, deleted_at,
             completed_at, progress, items
      FROM checklist_runs WHERE id LIKE 'matrix-run-%' ORDER BY id
    `).all().map((row) => {
      const items = JSON.parse(String(row.items));
      const firstItem = items[0]?.items?.[0] ?? {};
      return {
        id: String(row.id),
        userId: String(row.user_id),
        templateId: row.template_id === null ? null : String(row.template_id),
        status: String(row.status),
        isPublic: Number(row.is_public),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
        completedAt: row.completed_at === null ? null : String(row.completed_at),
        progress: Number(row.progress),
        note: typeof firstItem.notes === "string" ? firstItem.notes : "",
        completed: firstItem.isCompleted === true,
        normalizedItems: stripIdentityFields(items),
      };
    }),
  };
  const identityRows = {
    templates: database.prepare(`
      SELECT id, items FROM templates WHERE id LIKE 'matrix-template-%' ORDER BY id
    `).all().flatMap((row) =>
      collectStructureIdentities(String(row.id), JSON.parse(String(row.items))),
    ),
    runs: database.prepare(`
      SELECT id, items FROM checklist_runs WHERE id LIKE 'matrix-run-%' ORDER BY id
    `).all().flatMap((row) =>
      collectStructureIdentities(String(row.id), JSON.parse(String(row.items))),
    ),
  };
  return {
    rows,
    owners,
    activeDeleted,
    foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length,
    invalidJson: scalar(database, `
      SELECT (
        (SELECT COUNT(*) FROM templates WHERE id LIKE 'matrix-%' AND NOT json_valid(items)) +
        (SELECT COUNT(*) FROM checklist_runs WHERE id LIKE 'matrix-%' AND NOT json_valid(items))
        ${after0024 ? "+ (SELECT COUNT(*) FROM checklist_runs WHERE id LIKE 'matrix-%' AND NOT json_valid(retired_items))" : ""}
      ) AS value
    `),
    templateVersions: after0024
      ? database.prepare(`
          SELECT id, version, content_version
          FROM templates WHERE id LIKE 'matrix-template-%' ORDER BY id
        `).all().map((row) => ({
          id: String(row.id),
          version: Number(row.version),
          contentVersion: Number(row.content_version),
        }))
      : [],
    activeRuns,
    lifecycle,
    preservedRows,
    preservationHash: preservationHash(preservedRows),
    identityRows,
    identityHash: preservationHash(identityRows),
  };
}

export function compareMigrationSnapshots(
  pre: ReturnType<typeof capture>,
  post: ReturnType<typeof capture>,
) {
  const differences: string[] = [];
  if (preservationHash(pre.preservedRows) !== preservationHash(post.preservedRows)) {
    differences.push("per-row ownership, deletion, lifecycle, or content state changed");
  }
  if (preservationHash(pre.identityRows) !== preservationHash(post.identityRows)) {
    differences.push("existing section, item, or sub-item identities changed");
  }
  if (JSON.stringify(pre.rows) !== JSON.stringify(post.rows)) differences.push("row counts changed");
  if (JSON.stringify(pre.owners) !== JSON.stringify(post.owners)) differences.push("owner counts changed");
  if (JSON.stringify(pre.activeDeleted) !== JSON.stringify(post.activeDeleted)) {
    differences.push("active/deleted counts changed");
  }
  if (post.foreignKeyViolations !== 0) differences.push("foreign-key violations detected");
  if (post.invalidJson !== 0) differences.push("invalid JSON detected");
  return { differences, verdict: differences.length === 0 ? "pass" : "fail" } as const;
}

export function runProductionShapedMigrationMatrix({ plan }: { plan: { id: string; fixtureProfile: string; preMigration: string; migrationRange: { from: string | null; to: string | null }; affectedTables: string[]; invariants: string[]; declarationSha256: string } }) {
  if (plan.fixtureProfile !== "template-evolution-v1") throw new Error(`Rehearsal fixture profile ${plan.fixtureProfile} is not implemented.`);
  const database = replayMigrations({ through: plan.preMigration });
  database.exec("PRAGMA foreign_keys = ON");
  seed(database);
  const preHas0024 = plan.preMigration >= "0024_safe_template_evolution.sql";
  const pre = capture(database, preHas0024);
  if (plan.migrationRange.from) {
    const migrations = listMigrationFiles();
    const fromIndex = migrations.findIndex((entry) => entry.name === plan.migrationRange.from);
    const toIndex = migrations.findIndex((entry) => entry.name === plan.migrationRange.to);
    if (fromIndex < 0 || toIndex < fromIndex) throw new Error("Reviewed migration range is unavailable to the matrix.");
    for (const migration of migrations.slice(fromIndex, toIndex + 1)) database.exec(migration.sql);
  }
  const postHas0024 = preHas0024 || plan.migrationRange.to === "0024_safe_template_evolution.sql";
  const post = capture(database, postHas0024);
  database.close();

  const comparison = compareMigrationSnapshots(pre, post);

  return {
    check: `production-shaped-${plan.id}`,
    migrationRange: plan.migrationRange,
    coverage: { verdict: "pass", planId: plan.id, fixtureProfile: plan.fixtureProfile, affectedTables: plan.affectedTables, invariants: plan.invariants, declarationSha256: plan.declarationSha256 },
    pre,
    post,
    comparison,
    verdict: comparison.verdict,
  } as const;
}
