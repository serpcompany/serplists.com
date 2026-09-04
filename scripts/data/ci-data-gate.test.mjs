import { readFileSync } from "node:fs";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

describe("CI data regression gate ordering", () => {
  it("checks out full history and runs the schema contract as a direct blocking step", () => {
    const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
    const steps = workflow.jobs.quality.steps;
    const checkout = steps.find((step) => step.name === "Checkout");
    const schema = steps.find((step) => step.name === "Verify Drizzle D1 schema contract");
    expect(checkout.with["fetch-depth"]).toBe(0);
    expect(schema.run).toContain("pnpm run check:data:schema-contract");
    expect(schema.run).toContain("tmp/data-reports/ci");
    expect(schema.env.SCHEMA_CONTRACT_BASE_SHA).toContain("github.event.before");
    expect(schema.env.SCHEMA_CONTRACT_BASE_SHA).toContain("pull_request.base.sha");
    expect(schema["continue-on-error"]).not.toBe(true);
  });

  it("installs Chromium before the aggregate gate and does not run smoke twice", () => {
    const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
    const steps = workflow.jobs.quality.steps;
    const names = steps.map((step) => step.name);
    const installIndex = names.indexOf("Install Playwright browsers");
    const gateIndex = names.indexOf("Data regression gate");

    expect(installIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(installIndex);
    expect(names).not.toContain("Smoke tests");
    expect(steps[gateIndex].run).toContain("test:data-regressions");
  });

  it("always uploads required evidence for at least 90 days", () => {
    const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
    const upload = workflow.jobs.quality.steps.find((step) => step.name === "Upload data regression evidence");

    expect(upload.if).toBe("always()");
    expect(upload.with["retention-days"]).toBeGreaterThanOrEqual(90);
    expect(upload.with.path).toContain("tmp/data-reports/ci/");
    expect(upload.with.path).toContain("tests/test-results/");
  });
});
