import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

const enabled = Boolean(process.env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL);
const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";

test("@smoke exact sanitized rows pass authenticated candidate template and run reads and writes", async ({ page }) => {
  test.skip(!enabled, "Sanitized rehearsal artifact was not supplied.");
  await page.goto("/login");
  await page.locator("#email").fill("rehearsal-owner@e2e.local");
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible({ timeout: 30_000 });

  const proof = await page.evaluate(async ({ endpoint }) => {
    const request = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${endpoint}${path}`, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
      return { status: response.status, body: await response.json() };
    };
    const templates = await request("/templates");
    const runs = await request("/checklists");
    const template = Array.isArray(templates.body) ? templates.body.find((row) => String(row.id).startsWith("rehearsal-template-")) : null;
    const run = Array.isArray(runs.body) ? runs.body.find((row) => String(row.id).startsWith("rehearsal-run-")) : null;
    if (!template || !run) return { templatesStatus: templates.status, runsStatus: runs.status, templateRead: false, runRead: false, templateWriteReadback: false, runWriteReadback: false };
    const templateWrite = await request(`/templates/${template.id}`, { method: "PUT", body: JSON.stringify({ title: "Sanitized Template Handler Verified", expected_version: template.version }) });
    const runWrite = await request(`/checklists/${run.id}`, { method: "PUT", body: JSON.stringify({ progress: 42, expected_revision: run.revision }) });
    const updatedTemplate = await request(`/templates/${template.id}`);
    const updatedRun = await request(`/checklists/${run.id}`);
    return { templatesStatus: templates.status, runsStatus: runs.status, templateRead: true, runRead: true, templateWriteReadback: templateWrite.status === 200 && updatedTemplate.body.title === "Sanitized Template Handler Verified", runWriteReadback: runWrite.status === 200 && updatedRun.body.progress === 42 };
  }, { endpoint: apiBaseUrl });
  expect(proof).toMatchObject({ templatesStatus: 200, runsStatus: 200, templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true });
  const output = process.env.PLAYWRIGHT_REHEARSAL_PROOF;
  if (!output) throw new Error("Rehearsal proof output is required.");
  writeFileSync(output, JSON.stringify({ verdict: "pass", commit: process.env.DATA_REGRESSION_START_COMMIT, target: { environment: "local", databaseName: "serp-checklists-db", databaseId: "local:miniflare:DB@isolated-data-regression" }, migrationRange: { from: process.env.DATA_REGRESSION_MIGRATION_FROM === "none" ? null : process.env.DATA_REGRESSION_MIGRATION_FROM, to: process.env.DATA_REGRESSION_MIGRATION_TO === "none" ? null : process.env.DATA_REGRESSION_MIGRATION_TO }, sanitizerArtifactSha256: process.env.PLAYWRIGHT_SANITIZER_SHA256, checks: proof }, null, 2));
});
