import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const enabled = Boolean(process.env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL);
const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";

test("@smoke exact sanitized rows pass authenticated candidate template and run reads and writes", async ({ page }) => {
  test.skip(!enabled, "Sanitized rehearsal artifact was not supplied.");
  const state = JSON.parse(readFileSync(process.env.PLAYWRIGHT_REHEARSAL_STATE!, "utf8"));
  expect(state.transformation.verdict).toBe("pass");
  expect(state.commit).toBe(process.env.DATA_REGRESSION_START_COMMIT);
  expect(state.sourceSha256).toBe(process.env.PLAYWRIGHT_SANITIZER_SHA256);
  await page.goto("/login");
  await page.locator("#email").fill("rehearsal-owner@e2e.local");
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible({ timeout: 30_000 });

  // Check the actual migrated values before either handler writes. A valid
  // final schema and an arbitrary nonempty collection cannot satisfy this.
  for (const [kind, endpoint] of [["templates", "templates"], ["runs", "checklists"]]) {
    const rows = state.rows[kind].filter((row) => row.user_id === "rehearsal-owner-1" && row.deleted_at == null);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const result = await page.evaluate(async ({ url }) => { const response = await fetch(url, { credentials: "include" }); return { status: response.status, body: await response.json() }; }, { url: `${apiBaseUrl}/${endpoint}/${row.id}` });
      expect(result.status).toBe(200);
      for (const key of ["id", "title", "version", "content_version", "template_version", "revision", "progress"]) {
        if (Object.hasOwn(row, key)) expect(result.body[key], `${kind} migrated ${key}`).toEqual(row[key]);
      }
      expect(typeof result.body.items === "string" ? JSON.parse(result.body.items) : result.body.items).toEqual(JSON.parse(row.items));
    }
  }

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
  const { rows: _rows, commit, migrationRange, transformation, ...postMigrationState } = state;
  writeFileSync(output, JSON.stringify({ verdict: "pass", commit, target: { environment: "local", binding: "DB", databaseName: "serp-checklists-db", databaseId: "local:miniflare:DB@isolated-data-regression" }, migrationRange, sanitizerArtifactSha256: process.env.PLAYWRIGHT_SANITIZER_SHA256, postMigrationState, transformation, handlerStateReadback: true, checks: { templateRead: proof.templateRead, runRead: proof.runRead, templateWriteReadback: proof.templateWriteReadback, runWriteReadback: proof.runWriteReadback } }, null, 2));
});
