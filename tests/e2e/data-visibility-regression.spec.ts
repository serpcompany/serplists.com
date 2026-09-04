import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";

test("@smoke authenticated account-owned D1 template is visible through API and dashboard", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("Data Visibility QA");
  await page.getByLabel("Email").fill(`data-visibility-${suffix}@e2e.local`);
  await page.locator("#password").fill("Aa!data-visibility-password-12345");
  await page.locator("#confirmPassword").fill("Aa!data-visibility-password-12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible({
    timeout: 30_000,
  });

  const title = `Owned visibility template ${suffix}`;
  const updatedTitle = `${title} updated`;
  const created = await page.evaluate(async ({ endpoint, templateTitle }) => {
    const response = await fetch(`${endpoint}/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: templateTitle,
        sections: [{
          id: "visibility-section",
          title: "Visibility",
          items: [{ id: "visibility-item", title: "Remain visible" }],
        }],
        is_public: false,
      }),
    });
    return { status: response.status, body: await response.json() };
  }, { endpoint: apiBaseUrl, templateTitle: title });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const templateId = String(created.body.id);
  let runId: string | null = null;
  let proof = { templateRead: false, templateWriteReadback: false, runRead: false, runWriteReadback: false };

  try {
    const listed = await page.evaluate(async ({ endpoint, expectedId }) => {
      const response = await fetch(`${endpoint}/templates`, { credentials: "include" });
      const body = await response.json();
      return {
        status: response.status,
        isArray: Array.isArray(body),
        containsOwnedRow: Array.isArray(body) && body.some((row) => row.id === expectedId),
      };
    }, { endpoint: apiBaseUrl, expectedId: templateId });
    expect(listed).toEqual({ status: 200, isArray: true, containsOwnedRow: true });

    const behavior = await page.evaluate(async ({ endpoint, templateId: id, nextTitle }) => {
      const request = async (path: string, init?: RequestInit) => {
        const response = await fetch(`${endpoint}${path}`, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
        return { status: response.status, body: await response.json() };
      };
      const initialTemplate = await request(`/templates/${id}`);
      const templateWrite = await request(`/templates/${id}`, { method: "PUT", body: JSON.stringify({ title: nextTitle, expected_version: initialTemplate.body.version }) });
      const templateReadback = await request(`/templates/${id}`);
      const runCreate = await request("/checklists", { method: "POST", body: JSON.stringify({ template_id: id, title: "Candidate authenticated run" }) });
      const createdRunId = String(runCreate.body.id ?? "");
      const runList = await request("/checklists");
      const runRead = Array.isArray(runList.body) && runList.body.some((row) => row.id === createdRunId);
      const initialRun = await request(`/checklists/${createdRunId}`);
      const runWrite = await request(`/checklists/${createdRunId}`, { method: "PUT", body: JSON.stringify({ progress: 42, expected_revision: initialRun.body.revision }) });
      const runReadback = await request(`/checklists/${createdRunId}`);
      return {
        runId: createdRunId,
        proof: {
          templateRead: initialTemplate.status === 200 && initialTemplate.body.id === id,
          templateWriteReadback: templateWrite.status === 200 && templateReadback.status === 200 && templateReadback.body.title === nextTitle,
          runRead: runCreate.status === 200 && runList.status === 200 && runRead,
          runWriteReadback: runWrite.status === 200 && runReadback.status === 200 && runReadback.body.progress === 42,
        },
      };
    }, { endpoint: apiBaseUrl, templateId, nextTitle: updatedTitle });
    runId = behavior.runId;
    proof = behavior.proof;
    expect(proof).toEqual({ templateRead: true, templateWriteReadback: true, runRead: true, runWriteReadback: true });

    await page.goto("/dashboard/templates");
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
  } finally {
    await page.evaluate(async ({ endpoint, id, runId: createdRunId }) => {
      if (createdRunId) await fetch(`${endpoint}/checklists/${createdRunId}`, { method: "DELETE", credentials: "include" });
      await fetch(`${endpoint}/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }, { endpoint: apiBaseUrl, id: templateId, runId });
  }
  const proofPath = process.env.PLAYWRIGHT_CANDIDATE_AUTH_PROOF;
  if (proofPath) writeFileSync(proofPath, JSON.stringify({ verdict: "pass", commit: process.env.DATA_REGRESSION_START_COMMIT, checks: proof }, null, 2));
});
