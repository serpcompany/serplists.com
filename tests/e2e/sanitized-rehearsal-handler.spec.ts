import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseLegacySections, validRetiredChecklistContent } from "../../src/lib/schemas/legacyChecklistSchema";

const enabled = Boolean(process.env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL);
const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";

test("@smoke exact sanitized rows pass authenticated candidate template and run reads and writes", async ({ page, context }) => {
  test.skip(!enabled, "Sanitized rehearsal artifact was not supplied.");
  const state = JSON.parse(readFileSync(process.env.PLAYWRIGHT_REHEARSAL_STATE!, "utf8"));
  expect(state.transformation.verdict).toBe("pass");
  expect(state.commit).toBe(process.env.DATA_REGRESSION_START_COMMIT);
  expect(state.sourceSha256).toBe(process.env.PLAYWRIGHT_SANITIZER_SHA256);
  const manifest = JSON.parse(readFileSync(process.env.PLAYWRIGHT_SANITIZER_MANIFEST!, "utf8"));
  expect(state.sourceProfile).toEqual(manifest.sourceProfile);
  expect(state.manifestIntegritySha256).toBe(manifest.manifestIntegritySha256);
  await page.goto("/login");
  await page.locator("#email").fill("rehearsal-owner@e2e.local");
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible({ timeout: 30_000 });
  const request = async (path: string, init?: { method?: string; data?: unknown }) => {
    const response = await context.request.fetch(`${apiBaseUrl}${path}`, init);
    return { status: response.status(), body: await response.json() };
  };
  const initialBodies = new Map<string, unknown>();

  // Check the actual migrated values before either handler writes. A valid
  // final schema and an arbitrary nonempty collection cannot satisfy this.
  for (const [kind, endpoint] of [["templates", "templates"], ["runs", "checklists"]]) {
    const rows = state.rows[kind];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // The local authentication adapter covers this exact source owner. Do not
      // quietly exclude other imported owners from a claimed complete readback.
      expect(row.user_id, "Every imported row needs an authenticated source-owner readback").toBe("rehearsal-owner-1");
      const result = row.deleted_at == null ? await request(`/${endpoint}/${row.id}`) : await request(`/${endpoint}/archived`);
      expect(result.status).toBe(200);
      if (row.deleted_at != null) result.body = result.body.find((entry) => entry.id === row.id);
      expect(result.body).toBeTruthy();
      initialBodies.set(`${endpoint}/${row.id}`, result.body);
      for (const key of ["id", "user_id", "title", "version", "content_version", "template_id", "template_version", "revision", "progress", "status", "deleted_at", "completed_at", "started_at"]) {
        if (Object.hasOwn(row, key)) expect(result.body[key], `${kind} migrated ${key}`).toEqual(row[key]);
      }
      expect(typeof result.body.items === "string" ? JSON.parse(result.body.items) : result.body.items).toEqual(JSON.parse(row.items));
      if (Object.hasOwn(row, "retired_items")) expect(typeof result.body.retired_items === "string" ? JSON.parse(result.body.retired_items) : result.body.retired_items).toEqual(JSON.parse(row.retired_items));
    }
  }

  const malformed = [];
  const invalidContent = (kind, row) => ({
    invalidItems: !parseLegacySections(row.items).success,
    invalidRetiredItems: kind === "runs" && !validRetiredChecklistContent(row.retired_items),
  });
  const malformedActive = (kind, row) => {
    const invalid = invalidContent(kind, row);
    return row.deleted_at == null && (invalid.invalidItems || invalid.invalidRetiredItems);
  };
  for (const [kind, endpoint] of [["templates", "templates"], ["runs", "checklists"]]) {
    for (const row of state.rows[kind].filter(row => malformedActive(kind, row))) {
      const path = `/${endpoint}/${row.id}`;
      const refused = await request(path, { method: "PUT", data: kind === "templates" ? { title: "Unsafe malformed overwrite", expected_version: row.version } : { progress: 42, expected_revision: row.revision } });
      expect(refused.status, "Malformed source content must refuse writes").toBe(409);
      expect((await request(path)).body).toEqual(initialBodies.get(`${endpoint}/${row.id}`));
      malformed.push({ kind, ...invalidContent(kind, row), refusalStatus: refused.status, unchanged: true, unchangedAfterPositiveWrites: false });
    }
  }
  const privateActive = row => row.user_id === "rehearsal-owner-1" && !row.is_public && row.deleted_at == null;
  const validRun = row => parseLegacySections(row.items).success && validRetiredChecklistContent(row.retired_items);
  const template = state.rows.templates.find(row => privateActive(row) && parseLegacySections(row.items).success && state.rows.runs.filter(run => run.template_id === row.id && privateActive(run) && run.status === "in_progress").every(validRun));
  const run = state.rows.runs.find(row => privateActive(row) && row.status === "in_progress" && validRun(row));
  expect(template, "Source has no eligible valid active private template; no replacement fixture is allowed").toBeTruthy();
  expect(run, "Source has no eligible valid active private run; no replacement fixture is allowed").toBeTruthy();
  const templates = await request("/templates"), runs = await request("/checklists");
  expect(templates.status).toBe(200); expect(runs.status).toBe(200);
  expect(templates.body.some(row => row.id === template.id)).toBe(true);
  expect(runs.body.some(row => row.id === run.id)).toBe(true);
  expect((await request(`/templates/${template.id}`, { method: "PUT", data: { title: "Sanitized Template Handler Verified", expected_version: template.version } })).status).toBe(200);
  // Template writes may advance attached run revisions. Read the real revision.
  const currentRun = await request(`/checklists/${run.id}`);
  expect(currentRun.status).toBe(200);
  expect((await request(`/checklists/${run.id}`, { method: "PUT", data: { progress: 42, expected_revision: currentRun.body.revision } })).status).toBe(200);
  expect((await request(`/templates/${template.id}`)).body.title).toBe("Sanitized Template Handler Verified");
  expect((await request(`/checklists/${run.id}`)).body.progress).toBe(42);
  let malformedIndex = 0;
  for (const [kind, endpoint] of [["templates", "templates"], ["runs", "checklists"]]) {
    for (const row of state.rows[kind].filter(row => malformedActive(kind, row))) {
      expect((await request(`/${endpoint}/${row.id}`)).body).toEqual(initialBodies.get(`${endpoint}/${row.id}`));
      malformed[malformedIndex++].unchangedAfterPositiveWrites = true;
    }
  }
  const proof = { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true };
  const output = process.env.PLAYWRIGHT_REHEARSAL_PROOF;
  if (!output) throw new Error("Rehearsal proof output is required.");
  const { rows: _rows, commit, migrationRange, transformation, sourceProfile, manifestIntegritySha256, ...postMigrationState } = state;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ verdict: "pass", commit, target: { environment: "local", binding: "DB", databaseName: "serp-checklists-db", databaseId: "local:miniflare:DB@isolated-data-regression" }, migrationRange, sourceProfile, manifestIntegritySha256, sanitizerArtifactSha256: process.env.PLAYWRIGHT_SANITIZER_SHA256, postMigrationState, transformation, handlerStateReadback: true, malformedSourceChecks: malformed, checks: proof }, null, 2));
});
