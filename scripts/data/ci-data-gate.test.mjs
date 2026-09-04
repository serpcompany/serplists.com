import { readFileSync } from "node:fs";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

function workflow() {
  return yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
}

describe("CI blocking gates", () => {
  it("publishes stable required check names", () => {
    const jobs = workflow().jobs;
    expect(Object.values(jobs).map((job) => job.name)).toEqual([
      "Required / Quality",
      "Required / Database",
      "Required / Data regressions",
      "Required / Build",
    ]);
  });

  it("runs provenance, schema contract, and snapshot checks with full history", () => {
    const database = workflow().jobs.database;
    const checkout = database.steps.find((step) => step.name === "Checkout");
    const provenance = database.steps.find((step) => step.name === "Verify migration provenance");
    const schema = database.steps.find((step) => step.name === "Verify Drizzle D1 schema contract");
    const snapshot = database.steps.find((step) => step.name === "Verify generated schema snapshot");

    expect(checkout.with["fetch-depth"]).toBe(0);
    expect(provenance.run).toContain("check:data:migration-provenance");
    expect(provenance.run).toContain("--base");
    expect(provenance.env.MIGRATION_PROVENANCE_BASE_SHA).toContain("pull_request.base.sha");
    expect(provenance.env.MIGRATION_PROVENANCE_BASE_SHA).toContain("github.event.before");
    expect(schema.run).toContain("check:data:schema-contract");
    expect(schema.run).toContain("tmp/data-reports/ci");
    expect(schema.env.SCHEMA_CONTRACT_BASE_SHA).toContain("pull_request.base.sha");
    expect(snapshot.run).toContain("db:schema:snapshot:check");
    for (const step of [provenance, schema, snapshot]) expect(step["continue-on-error"]).not.toBe(true);
  });

  it("orders regression and build checks after their prerequisites", () => {
    const jobs = workflow().jobs;
    expect(jobs["data-regressions"].needs).toEqual(["quality", "database"]);
    expect(jobs.build.needs).toEqual(["quality", "database", "data-regressions"]);
    const names = jobs["data-regressions"].steps.map((step) => step.name);
    expect(names.indexOf("Install Playwright browsers")).toBeLessThan(names.indexOf("Data regression gate"));
    expect(jobs["data-regressions"].steps.find((step) => step.name === "Data regression gate").run).toContain("test:data-regressions");
  });

  it("always uploads database and regression evidence for at least 90 days", () => {
    const jobs = workflow().jobs;
    for (const [jobName, stepName] of [
      ["database", "Upload database evidence"],
      ["data-regressions", "Upload data regression evidence"],
    ]) {
      const upload = jobs[jobName].steps.find((step) => step.name === stepName);
      expect(upload.if).toBe("always()");
      expect(upload.with["retention-days"]).toBeGreaterThanOrEqual(90);
      expect(upload["continue-on-error"]).not.toBe(true);
    }
  });

  it("pins every CI job to the repository Node version", () => {
    for (const job of Object.values(workflow().jobs)) {
      const setup = job.steps.find((step) => step.name === "Setup Node");
      expect(setup.with["node-version-file"]).toBe(".node-version");
    }
  });
});
