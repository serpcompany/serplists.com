import { describe, expect, it } from "vitest";
import {
  diffD1Schema,
  formatSchemaDrift,
  mapColumnConstraintPragmaResults,
  mapForeignKeyPragmaResults,
  mapIndexPragmaResults,
  mapPragmaResults,
} from "../../../scripts/check-production-d1-schema-lib.mjs";

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

    expect(message).toContain("Production D1 schema drift detected for serp-checklists-db.");
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
