import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { parseSeedStatus } from "../../../scripts/lib/local-d1-seed";
import { runScriptProcess } from "../../support/scriptProcess";

const SCRIPT = "scripts/data/local-d1-data.ts";

describe("scripts/data/local-d1-data.ts, which setup and the db:* scripts run", { timeout: 120_000 }, () => {
  const persistPath = mkdtempSync(path.join(tmpdir(), "serplists-local-d1-data-"));
  afterAll(() => rmSync(persistPath, { recursive: true, force: true }));

  it("reports nothing seeded for a local D1 that setup has not migrated yet", async () => {
    const run = await runScriptProcess(SCRIPT, { args: ["seed-status", "--persist-to", persistPath] });

    expect(run.status).toBe(0);
    expect(parseSeedStatus(run.stdout)).toEqual({
      testData: false,
      officialTemplates: false,
      officialLogin: false,
      legacyTestSlugs: false,
    });
  }, 60_000);

  it.each([
    [["seed-everything"], "Usage: tsx scripts/data/local-d1-data.ts <seed-test|"],
    [[], "Usage: tsx scripts/data/local-d1-data.ts <seed-test|"],
    [["seed-status", "--persist-to"], "--persist-to requires a path"],
  ])("refuses %j", async (args, refusal) => {
    const run = await runScriptProcess(SCRIPT, { args });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(refusal);
  });
});
