import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  scriptRunInAStandInProject,
  STAND_IN_PRODUCTION_ID,
  STAND_IN_STAGING_ID,
  UNAUTHORIZED_ACCOUNT,
} from "../../support/cloudflareD1StandIn";
import { SqliteD1 } from "../../support/sqlite-d1";

const SCRIPT = "scripts/check-production-d1-schema.ts";
const queriedSql = z.object({ sql: z.string() });

const migratedDatabase = () => new SqliteD1().sqlite;

describe("pnpm run check:staging:d1-schema and check:prod:d1-schema, against a D1 API stand-in", { timeout: 120_000 }, () => {
  const check = scriptRunInAStandInProject(SCRIPT);

  it("passes a staging database built by every migration, in one remote query against the preview database", async () => {
    const run = await check(["--database", "DB", "--label", "staging", "--preview"], {
      [STAND_IN_STAGING_ID]: migratedDatabase(),
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("staging d1 schema ok (DB)");
    expect(run.calls.map((call) => call.databaseId)).toEqual([STAND_IN_STAGING_ID]);
    expect(queriedSql.parse(JSON.parse(run.calls[0]?.body ?? "")).sql).toContain("pragma table_info('templates');");
  });

  it("checks serp-checklists-db as production by default, and reads --database=<name>", async () => {
    const byDefault = await check([], { [STAND_IN_PRODUCTION_ID]: migratedDatabase() });
    const inline = await check(["--database=serp-checklists-db", "--label=production"], { [STAND_IN_PRODUCTION_ID]: migratedDatabase() });

    expect(byDefault.stdout).toContain("production d1 schema ok (serp-checklists-db)");
    expect(inline.stdout).toContain("production d1 schema ok (serp-checklists-db)");
  });

  it("takes the database and label from D1_DATABASE_NAME and D1_ENVIRONMENT when no flag names them", async () => {
    const run = await check(["--preview"], { [STAND_IN_STAGING_ID]: migratedDatabase() }, {
      env: { D1_DATABASE_NAME: "DB", D1_ENVIRONMENT: "staging" },
    });

    expect(run.stdout).toContain("staging d1 schema ok (DB)");
  });

  it("fails on a database whose index and column a migration made are gone", async () => {
    const drifted = migratedDatabase();
    drifted.exec("DROP INDEX idx_templates_owner");
    drifted.exec("ALTER TABLE users DROP COLUMN email_verified");

    const run = await check(["--database", "DB", "--label", "staging", "--preview"], { [STAND_IN_STAGING_ID]: drifted });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("D1 schema drift detected for staging:DB.");
    expect(run.stderr).toContain("- templates: missing indexes idx_templates_owner");
    expect(run.stderr).toContain("- users: missing columns email_verified");
  });

  it("says it could not verify the schema when Wrangler cannot read the database", async () => {
    const run = await check(["--database", "DB", "--label", "staging", "--preview"], {}, { failWith: UNAUTHORIZED_ACCOUNT });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Unable to verify staging D1 schema for DB.");
    expect(run.calls).not.toEqual([]);
  });
});
