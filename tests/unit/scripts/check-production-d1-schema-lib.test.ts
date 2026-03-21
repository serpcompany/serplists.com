import { describe, expect, it } from "vitest";
import {
  diffD1Schema,
  formatSchemaDrift,
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
      },
      "serp-checklists-db",
    );

    expect(message).toContain("Production D1 schema drift detected for serp-checklists-db.");
    expect(message).toContain("- missing table: entitlement_overrides");
    expect(message).toContain("- templates: missing columns version");
    expect(message).toContain("- checklist_runs: missing columns share_token, share_used_at");
    expect(message).toContain("Apply the required checked-in D1 migrations before deploying.");
  });
});
