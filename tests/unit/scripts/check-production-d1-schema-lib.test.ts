import { readFileSync } from "node:fs";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as drizzleSchema from "../../../db/schema/index";
import {
  REQUIRED_D1_COLUMN_CONSTRAINTS,
  REQUIRED_D1_FOREIGN_KEYS,
  REQUIRED_D1_INDEXES,
  REQUIRED_D1_SCHEMA,
  REQUIRED_D1_TRIGGERS,
  buildSchemaQuery,
  diffD1Schema,
  diffD1Triggers,
  formatSchemaDrift,
  hasSchemaDrift,
  mapColumnConstraintPragmaResults,
  mapForeignKeyPragmaResults,
  mapIndexPragmaResults,
  mapPragmaResults,
  mapTriggerResults,
  splitSchemaQueryResults,
} from "../../../scripts/check-production-d1-schema-lib.mjs";

type RequiredIndex = { name: string; unique?: boolean; partial?: boolean };
type RequiredForeignKey = { from: string; table: string; to: string; onDelete?: string };
type SqlOnlyTrigger = { name: string; table: string; definition: string };

const drizzleTables = Object.values(drizzleSchema as Record<string, unknown>)
  .filter((value): value is SQLiteTable => is(value, SQLiteTable))
  .map((table) => getTableConfig(table));

const sqlOnlyTriggers = (JSON.parse(readFileSync("db/sql-only-schema.json", "utf8")) as {
  triggers: SqlOnlyTrigger[];
}).triggers;

const ADDED_IN_0024 = ["content_version", "template_version", "revision", "retired_items"];

function sortIndexesByTable(record: Record<string, RequiredIndex[]>) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, indexes]) => indexes.length > 0)
      .map(([table, indexes]) => [
        table,
        indexes
          .map((index) => ({ name: index.name, unique: index.unique === true, partial: index.partial === true }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ]),
  );
}

describe("REQUIRED_D1_* in scripts/check-production-d1-schema-lib.mjs matches db/schema/", () => {
  it("requires every table and column in the Drizzle schema", () => {
    const required = Object.fromEntries(
      Object.entries(REQUIRED_D1_SCHEMA as Record<string, string[]>).map(([table, columns]) => [
        table,
        [...columns].sort(),
      ]),
    );
    const drizzle = Object.fromEntries(
      drizzleTables.map((table) => [table.name, table.columns.map((column) => column.name).sort()]),
    );

    expect(required).toEqual(drizzle);
  });

  it("requires every named Drizzle index with its unique and partial flags", () => {
    const drizzle = Object.fromEntries(
      drizzleTables.map((table) => [
        table.name,
        table.indexes.map((index) => ({
          name: index.config.name,
          unique: Boolean(index.config.unique),
          partial: Boolean(index.config.where),
        })),
      ]),
    );

    expect(sortIndexesByTable(REQUIRED_D1_INDEXES as Record<string, RequiredIndex[]>)).toEqual(
      sortIndexesByTable(drizzle),
    );
  });

  it("only requires column constraints and foreign keys that Drizzle declares", () => {
    const constraints = REQUIRED_D1_COLUMN_CONSTRAINTS as Record<
      string,
      Record<string, { notNull?: boolean; primaryKey?: boolean }>
    >;
    for (const [tableName, columns] of Object.entries(constraints)) {
      const table = drizzleTables.find((candidate) => candidate.name === tableName);
      const tablePrimaryKeyColumns = (table?.primaryKeys ?? []).flatMap((key) => key.columns.map((column) => column.name));
      for (const [columnName, required] of Object.entries(columns)) {
        const column = table?.columns.find((candidate) => candidate.name === columnName);
        expect(column, `${tableName}.${columnName}`).toBeDefined();
        if (required.notNull) expect(column?.notNull).toBe(true);
        if (required.primaryKey) expect(column?.primary || tablePrimaryKeyColumns.includes(columnName)).toBe(true);
      }
    }

    const foreignKeysByTable = REQUIRED_D1_FOREIGN_KEYS as Record<string, RequiredForeignKey[]>;
    for (const [tableName, foreignKeys] of Object.entries(foreignKeysByTable)) {
      const table = drizzleTables.find((candidate) => candidate.name === tableName);
      const declared = (table?.foreignKeys ?? []).map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          from: reference.columns.map((column) => column.name).join(","),
          table: getTableConfig(reference.foreignTable).name,
          to: reference.foreignColumns.map((column) => column.name).join(","),
          onDelete: (foreignKey.onDelete ?? "no action").toUpperCase(),
        };
      });
      for (const foreignKey of foreignKeys) {
        expect(declared).toContainEqual({ ...foreignKey, onDelete: (foreignKey.onDelete ?? "NO ACTION").toUpperCase() });
      }
    }
  });

  it("requires every SQL-only trigger on its table", () => {
    expect(REQUIRED_D1_TRIGGERS).toEqual(sqlOnlyTriggers);
  });

  it("reports the 0024 columns missing from a database that stopped at 0023", () => {
    const actual = Object.fromEntries(
      Object.entries(REQUIRED_D1_SCHEMA as Record<string, string[]>).map(([table, columns]) => [
        table,
        columns.filter((column) => !ADDED_IN_0024.includes(column)),
      ]),
    );

    expect(diffD1Schema(REQUIRED_D1_SCHEMA, actual).missingColumns).toEqual({
      templates: ["content_version"],
      checklist_runs: ["template_version", "revision", "retired_items"],
    });
  });
});

describe("schema query", () => {
  it("reads table, index and foreign-key pragmas per table, then the triggers", () => {
    expect(buildSchemaQuery(["users", "templates"])).toBe(
      "pragma table_info('users'); pragma table_info('templates'); " +
        "pragma index_list('users'); pragma index_list('templates'); " +
        "pragma foreign_key_list('users'); pragma foreign_key_list('templates'); " +
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger';",
    );
  });

  it("splits Wrangler results into bounded groups", () => {
    const results = ["t1", "t2", "i1", "i2", "f1", "f2", "triggers"].map((id) => ({ results: [{ id }] }));

    expect(splitSchemaQueryResults(["users", "templates"], results)).toEqual({
      tableResults: [results[0], results[1]],
      indexResults: [results[2], results[3]],
      foreignKeyResults: [results[4], results[5]],
      triggerResult: results[6],
    });
    expect(() => splitSchemaQueryResults(["users", "templates"], results.slice(0, 6))).toThrow(
      /expected 7 result sets/,
    );
  });
});

describe("trigger checks", () => {
  const ownerInsert = sqlOnlyTriggers.find((trigger) => trigger.name === "sitemap_owner_users_insert")!;
  const templatesUpdate = sqlOnlyTriggers.find((trigger) => trigger.name === "sitemap_templates_update")!;

  it("accepts a trigger whose SQL differs only in whitespace and quoting", () => {
    const actual = mapTriggerResults({
      results: [
        {
          name: ownerInsert.name,
          tbl_name: "users",
          sql: ownerInsert.definition.replace("AFTER INSERT ON users", 'AFTER INSERT\n  ON "users"'),
        },
      ],
    });

    expect(diffD1Triggers([ownerInsert], actual)).toEqual({ missingTriggers: [], invalidTriggers: [] });
  });

  it("reports missing triggers, triggers on the wrong table and changed definitions", () => {
    const actual = mapTriggerResults({
      results: [
        { name: ownerInsert.name, tbl_name: "templates", sql: ownerInsert.definition },
        {
          name: templatesUpdate.name,
          tbl_name: "templates",
          sql: "CREATE TRIGGER sitemap_templates_update AFTER UPDATE ON templates BEGIN SELECT 1; END",
        },
      ],
    });

    const diff = diffD1Triggers(sqlOnlyTriggers, actual);

    expect(diff.missingTriggers).toEqual(
      sqlOnlyTriggers
        .map((trigger) => trigger.name)
        .filter((name) => name !== ownerInsert.name && name !== templatesUpdate.name),
    );
    expect(diff.invalidTriggers).toEqual([
      { name: ownerInsert.name, issues: ["expected on users, found on templates"] },
      { name: templatesUpdate.name, issues: ["definition differs from db/sql-only-schema.json"] },
    ]);

    const noSchemaDrift = diffD1Schema({}, {});
    expect(hasSchemaDrift({ ...noSchemaDrift, ...diff })).toBe(true);
    expect(hasSchemaDrift({ ...noSchemaDrift, missingTriggers: [], invalidTriggers: [] })).toBe(false);

    const message = formatSchemaDrift({ ...noSchemaDrift, ...diff }, "staging:DB");
    expect(message).toContain("D1 schema drift detected for staging:DB.");
    expect(message).not.toContain("Production");
    expect(message).toContain(`- missing trigger: ${diff.missingTriggers[0]}`);
    expect(message).toContain(`- invalid trigger ${ownerInsert.name} (expected on users, found on templates)`);
  });
});

describe("mapPragmaResults", () => {
  it("maps wrangler pragma results back to their table names", () => {
    const actual = mapPragmaResults(
      ["templates", "checklist_runs"],
      [
        { results: [{ name: "id" }, { name: "version" }, { name: "title" }] },
        { results: [{ name: "id" }, { name: "share_token" }] },
      ],
    );

    expect(actual).toEqual({
      templates: ["id", "title", "version"],
      checklist_runs: ["id", "share_token"],
    });
  });
});

describe("mapIndexPragmaResults", () => {
  it("maps wrangler index pragma results back to their table names", () => {
    const actual = mapIndexPragmaResults(
      ["team_members", "team_invites"],
      [
        {
          results: [
            { name: "idx_team_members_team_user_unique", unique: 1, partial: 0 },
            { name: "idx_team_members_active_owner_unique", unique: 1, partial: 1 },
          ],
        },
        {
          results: [
            { name: "idx_team_invites_email", unique: 0, partial: 0 },
          ],
        },
      ],
    );

    expect(actual).toEqual({
      team_members: {
        idx_team_members_team_user_unique: { unique: true, partial: false },
        idx_team_members_active_owner_unique: { unique: true, partial: true },
      },
      team_invites: {
        idx_team_invites_email: { unique: false, partial: false },
      },
    });
  });
});

describe("constraint pragma mapping", () => {
  it("maps column and foreign-key constraints", () => {
    expect(mapColumnConstraintPragmaResults(
      ["personal_run_keys"],
      [{ results: [{ name: "id", notnull: 1, pk: 1 }, { name: "name", notnull: 1, pk: 0 }] }],
    )).toEqual({
      personal_run_keys: {
        id: { notNull: true, primaryKey: true },
        name: { notNull: true, primaryKey: false },
      },
    });

    expect(mapForeignKeyPragmaResults(
      ["personal_run_keys"],
      [{ results: [{ table: "users", from: "user_id", to: "id", on_delete: "cascade" }] }],
    )).toEqual({
      personal_run_keys: [
        { from: "user_id", table: "users", to: "id", onDelete: "CASCADE" },
      ],
    });
  });
});

describe("diffD1Schema", () => {
  it("reports missing tables and missing columns", () => {
    const diff = diffD1Schema(
      {
        templates: ["id", "title", "version"],
        checklist_runs: ["id", "share_token"],
        entitlement_overrides: ["user_id", "plan"],
      },
      {
        templates: ["id", "title"],
        checklist_runs: ["id"],
        entitlement_overrides: [],
      },
    );

    expect(diff).toEqual({
      missingTables: ["entitlement_overrides"],
      missingColumns: {
        templates: ["version"],
        checklist_runs: ["share_token"],
      },
      missingIndexes: {},
      invalidIndexes: {},
      invalidColumns: {},
      missingForeignKeys: {},
      invalidForeignKeys: {},
    });
  });

  it("allows extra columns and reports no drift when required columns exist", () => {
    const diff = diffD1Schema(
      {
        templates: ["id", "title", "version"],
      },
      {
        templates: ["created_at", "id", "title", "updated_at", "version"],
      },
    );

    expect(diff).toEqual({
      missingTables: [],
      missingColumns: {},
      missingIndexes: {},
      invalidIndexes: {},
      invalidColumns: {},
      missingForeignKeys: {},
      invalidForeignKeys: {},
    });
  });

  it("reports missing and invalid required indexes", () => {
    const diff = diffD1Schema(
      {
        team_members: ["id", "team_id", "user_id", "role", "status"],
      },
      {
        team_members: ["id", "team_id", "user_id", "role", "status"],
      },
      {
        team_members: [
          { name: "idx_team_members_team_user_unique", unique: true },
          { name: "idx_team_members_active_owner_unique", unique: true, partial: true },
        ],
      },
      {
        team_members: {
          idx_team_members_team_user_unique: { unique: false, partial: false },
        },
      },
    );

    expect(diff).toEqual({
      missingTables: [],
      missingColumns: {},
      missingIndexes: {
        team_members: ["idx_team_members_active_owner_unique"],
      },
      invalidIndexes: {
        team_members: [
          {
            name: "idx_team_members_team_user_unique",
            issues: ["expected unique"],
          },
        ],
      },
      invalidColumns: {},
      missingForeignKeys: {},
      invalidForeignKeys: {},
    });
  });

  it("reports invalid primary-key nullability and cascade behavior", () => {
    const diff = diffD1Schema(
      { personal_run_keys: ["id", "user_id"] },
      { personal_run_keys: ["id", "user_id"] },
      {},
      {},
      { personal_run_keys: { id: { notNull: true, primaryKey: true } } },
      { personal_run_keys: { id: { notNull: false, primaryKey: true } } },
      { personal_run_keys: [{ from: "user_id", table: "users", to: "id", onDelete: "CASCADE" }] },
      { personal_run_keys: [{ from: "user_id", table: "users", to: "id", onDelete: "NO ACTION" }] },
    );

    expect(diff.invalidColumns).toEqual({
      personal_run_keys: [{ name: "id", issues: ["expected NOT NULL"] }],
    });
    expect(diff.invalidForeignKeys).toEqual({
      personal_run_keys: [{
        name: "user_id->users.id",
        issues: ["expected ON DELETE CASCADE"],
      }],
    });
  });
});

describe("formatSchemaDrift", () => {
  it("formats a readable migration gate error", () => {
    const message = formatSchemaDrift(
      {
        missingTables: ["entitlement_overrides"],
        missingColumns: {
          templates: ["version"],
          checklist_runs: ["share_token", "share_used_at"],
        },
        missingIndexes: {
          team_members: ["idx_team_members_active_owner_unique"],
        },
        invalidIndexes: {
          team_invites: [
            {
              name: "idx_team_invites_token_hash_unique",
              issues: ["expected unique"],
            },
          ],
        },
        invalidColumns: {
          personal_run_keys: [{ name: "id", issues: ["expected NOT NULL"] }],
        },
        missingForeignKeys: {
          personal_run_keys: ["user_id->users.id"],
        },
        invalidForeignKeys: {},
      },
      "serp-checklists-db",
    );

    expect(message).toContain("D1 schema drift detected for serp-checklists-db.");
    expect(message).toContain("- missing table: entitlement_overrides");
    expect(message).toContain("- templates: missing columns version");
    expect(message).toContain("- checklist_runs: missing columns share_token, share_used_at");
    expect(message).toContain("- team_members: missing indexes idx_team_members_active_owner_unique");
    expect(message).toContain("- team_invites: invalid index idx_team_invites_token_hash_unique (expected unique)");
    expect(message).toContain("- personal_run_keys: invalid column id (expected NOT NULL)");
    expect(message).toContain("- personal_run_keys: missing foreign keys user_id->users.id");
    expect(message).toContain("Apply the required checked-in D1 migrations before deploying.");
  });
});
