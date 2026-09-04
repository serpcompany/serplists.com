import { expect, test } from "@playwright/test";

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

    await page.goto("/dashboard/templates");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  } finally {
    await page.evaluate(async ({ endpoint, id }) => {
      await fetch(`${endpoint}/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }, { endpoint: apiBaseUrl, id: templateId });
  }
});
