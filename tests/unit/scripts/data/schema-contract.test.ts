import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import * as drizzleSchema from "../../../../db/schema/index";
import {
  buildDrizzleContract,
  buildCatalogContract,
  catalogFromPragmaResults,
  compareDatabaseSchemas,
  diffDrizzleContract,
  diffRuntimeSchema,
  inspectDatabase,
  listMigrationFiles,
  replayMigrations,
} from "../../../../scripts/data/schema-contract";

describe("Drizzle to D1 schema contract", () => {
  it("maps Wrangler's public pragma results into the remote schema contract", () => {
    const catalog = catalogFromPragmaResults(
      ["templates"],
      [
        { results: [{ name: "id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 }] },
        { results: [{ name: "idx_templates_owner", unique: 0, partial: 0 }] },
        { results: [
          { index_name: "idx_templates_owner", seqno: 0, column_name: "owner_type", index_sql: "CREATE INDEX idx_templates_owner ON templates(owner_type, user_id)" },
          { index_name: "idx_templates_owner", seqno: 1, column_name: "user_id", index_sql: "CREATE INDEX idx_templates_owner ON templates(owner_type, user_id)" },
        ] },
      ],
    );

    expect(catalog.tables.templates).toEqual({
      columns: [{ name: "id", type: "TEXT", notNull: true, defaultValue: null, primaryKey: 1 }],
      indexes: [{ name: "idx_templates_owner", unique: false, partial: false, columns: ["owner_type", "user_id"], predicate: null }],
    });
  });

  it("derives migration 0024 requirements directly from the runtime Drizzle schema", () => {
    const contract = buildDrizzleContract(drizzleSchema);

    expect(contract.tables.templates.columns).toContainEqual(expect.objectContaining({
      name: "content_version",
      affinity: "INTEGER",
      notNull: true,
      defaultValue: "1",
    }));
    expect(contract.tables.checklist_runs.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      "template_version", "revision", "retired_items",
    ]));
    expect(contract.tables.account.indexes).toContainEqual({
      name: "account_user_id_idx",
      unique: false,
      partial: false,
      columns: ["user_id"],
      predicate: null,
    });
    expect(contract.tables.session.indexes).toContainEqual({
      name: "session_token_unique",
      unique: true,
      partial: false,
      columns: ["token"],
      matchByColumns: true,
      predicate: null,
    });
  });

  it("rejects an index that has the right name but wrong ordered columns", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE example (id TEXT, owner_type TEXT, user_id TEXT);
      CREATE INDEX idx_example_owner ON example(user_id, owner_type);
    `);
    const diff = diffDrizzleContract({
      tables: {
        example: {
          columns: [
            { name: "id", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
            { name: "owner_type", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
            { name: "user_id", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
          ],
          indexes: [{
            name: "idx_example_owner",
            unique: false,
            partial: false,
            columns: ["owner_type", "user_id"],
          }],
        },
      },
    }, inspectDatabase(database));

    expect(diff.invalidIndexes.example).toEqual([{
      name: "idx_example_owner",
      issues: ["expected columns owner_type, user_id; received user_id, owner_type"],
    }]);
    expect(diff.verdict).toBe("fail");
    database.close();
  });

  it("rejects the reviewer case where content_version becomes nullable TEXT without a default", () => {
    const database = replayMigrations();
    const catalog = inspectDatabase(database);
    const contentVersion = catalog.tables.templates.columns.find((column) => column.name === "content_version")!;
    contentVersion.type = "TEXT";
    contentVersion.notNull = false;
    contentVersion.defaultValue = null;

    const diff = diffRuntimeSchema(drizzleSchema, catalog);
    expect(diff.invalidColumns.templates).toEqual([{
      name: "content_version",
      issues: [
        "expected affinity INTEGER; received TEXT",
        "expected NOT NULL",
        "expected default 1; received no default",
      ],
    }]);
    expect(diff.verdict).toBe("fail");
    database.close();
  });

  it("rejects a partial index whose name and columns match but WHERE predicate changed", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE memberships (team_id TEXT, role TEXT, status TEXT);
      CREATE UNIQUE INDEX idx_active_owner ON memberships(team_id)
        WHERE role = 'owner' AND status = 'disabled';
    `);
    const diff = diffDrizzleContract({
      tables: {
        memberships: {
          columns: [
            { name: "team_id", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
            { name: "role", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
            { name: "status", affinity: "TEXT", notNull: false, defaultValue: null, primaryKey: 0 },
          ],
          indexes: [{
            name: "idx_active_owner",
            unique: true,
            partial: true,
            columns: ["team_id"],
            predicate: "role = 'owner' AND status = 'active'",
          }],
        },
      },
    }, inspectDatabase(database));

    expect(diff.invalidIndexes.memberships).toEqual([{
      name: "idx_active_owner",
      issues: ["expected predicate role = 'owner' and status = 'active'; received role = 'owner' and status = 'disabled'"],
    }]);
    expect(diff.verdict).toBe("fail");
    database.close();
  });

  it("compares replay-derived SQL-only partial predicates against a live catalog", () => {
    const database = replayMigrations();
    const expected = buildCatalogContract(inspectDatabase(database));
    const liveCatalog = inspectDatabase(database);
    const liveIndex = liveCatalog.tables.team_members.indexes.find(
      (index) => index.name === "idx_team_members_active_owner_unique",
    )!;
    liveIndex.predicate = "role = 'owner' AND status = 'disabled'";

    expect(diffDrizzleContract(expected, liveCatalog).invalidIndexes.team_members).toEqual([{
      name: "idx_team_members_active_owner_unique",
      issues: ["expected predicate role = 'owner' and status = 'active'; received role = 'owner' and status = 'disabled'"],
    }]);
    database.close();
  });

  it("rejects the pre-incident migration 0023 schema", () => {
    const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    const diff = diffRuntimeSchema(drizzleSchema, inspectDatabase(database));

    expect(diff.missingColumns).toEqual({
      checklist_runs: ["retired_items", "revision", "template_version"],
      templates: ["content_version"],
    });
    expect(diff.verdict).toBe("fail");
    database.close();
  });

  it("accepts a fresh database built from the complete Wrangler migration chain", () => {
    const database = replayMigrations();
    const diff = diffDrizzleContract(buildDrizzleContract(drizzleSchema), inspectDatabase(database));

    expect(diff).toMatchObject({
      missingTables: [],
      missingColumns: {},
      unexpectedColumns: {},
      missingIndexes: {},
      verdict: "pass",
    });
    database.close();
  });

  it("fails when Drizzle adds a runtime column without a matching migration", () => {
    const database = replayMigrations();
    const contract = buildDrizzleContract(drizzleSchema);
    contract.tables.templates.columns.push({
      name: "drizzle_only_column",
      affinity: "TEXT",
      notNull: false,
      defaultValue: null,
      primaryKey: 0,
    });

    expect(diffDrizzleContract(contract, inspectDatabase(database))).toMatchObject({
      missingColumns: { templates: ["drizzle_only_column"] },
      verdict: "fail",
    });
    database.close();
  });

  it("uses the live Drizzle schema as the direct remote-check authority", () => {
    const preIncidentDatabase = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });

    expect(diffRuntimeSchema(drizzleSchema, inspectDatabase(preIncidentDatabase))).toMatchObject({
      missingColumns: {
        checklist_runs: ["retired_items", "revision", "template_version"],
        templates: ["content_version"],
      },
      verdict: "fail",
    });
    preIncidentDatabase.close();
  });

  it("fails when a migration changes a runtime table without updating Drizzle", () => {
    const database = replayMigrations();
    database.exec("ALTER TABLE templates ADD COLUMN migration_only_column TEXT;");

    expect(diffDrizzleContract(buildDrizzleContract(drizzleSchema), inspectDatabase(database))).toMatchObject({
      unexpectedColumns: { templates: ["migration_only_column"] },
      verdict: "fail",
    });
    database.close();
  });

  it("keeps the derived schema snapshot in lockstep with the complete migration chain", () => {
    const migrated = replayMigrations();
    const snapshot = new DatabaseSync(":memory:");
    snapshot.exec(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));

    expect(compareDatabaseSchemas(inspectDatabase(migrated), inspectDatabase(snapshot))).toEqual({
      differences: [],
      verdict: "pass",
    });
    migrated.close();
    snapshot.close();
  });

  it("upgrades representative 0023 data through 0024 without losing rows or ownership", () => {
    const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    const items = JSON.stringify([{ title: "Task", isCompleted: true, notes: "keep me" }]);
    database.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    ).run("owner-1", "owner@example.test", "2026-09-04T00:00:00Z");
    database.prepare(
      "INSERT INTO templates (id, user_id, title, items, version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("template-1", "owner-1", "Owned", items, 3, "2026-09-04T00:00:00Z");
    database.prepare(
      "INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "run-1",
      "owner-1",
      "template-1",
      "Owned run",
      items,
      "in_progress",
      "2026-09-04T00:00:00Z",
      "2026-09-04T00:00:00Z",
    );

    const before = database.prepare(
      "SELECT (SELECT count(*) FROM templates) AS templates, (SELECT count(*) FROM checklist_runs) AS runs",
    ).get();
    const migration = listMigrationFiles().find((entry) => entry.name === "0024_safe_template_evolution.sql");
    expect(migration).toBeDefined();
    database.exec(migration!.sql);
    const after = database.prepare(
      "SELECT (SELECT count(*) FROM templates) AS templates, (SELECT count(*) FROM checklist_runs) AS runs",
    ).get();
    const upgraded = database.prepare(
      "SELECT t.user_id, t.content_version, r.user_id AS run_user_id, r.template_version, r.revision, r.retired_items, r.items FROM templates t JOIN checklist_runs r ON r.template_id = t.id",
    ).get() as Record<string, unknown>;

    expect(after).toEqual(before);
    expect(upgraded).toMatchObject({
      user_id: "owner-1",
      run_user_id: "owner-1",
      content_version: 4,
      template_version: 0,
      revision: 1,
      retired_items: "[]",
    });
    expect(JSON.parse(String(upgraded.items))[0].items[0]).toMatchObject({
      isCompleted: true,
      notes: "keep me",
    });
    database.close();
  });
});
