import { expect, test, type Page } from "@playwright/test";

import { apiRequest } from "./support/api-requests";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /fill admin/i }).click();
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/);
}

test("template import API returns structured per-template failures for rejected imports", async ({ page }) => {
  await signInAsAdmin(page);

  const result = await apiRequest<Record<string, unknown>>(page, "/templates/backup", {
    method: "POST",
    body: {
      templates: [
        {
          title: "Broken From E2E A",
          sections: "not-json",
        },
        {
          title: "Broken From E2E B",
          sections: "still-not-json",
        },
      ],
    },
  });

  expect(result.status).toBe(400);
  expect(result.body?.code).toBe("template_import_failed");
  expect(result.body?.details).toEqual(
    expect.objectContaining({
      total: 2,
      imported: 0,
      failed: [
        expect.objectContaining({
          title: "Broken From E2E A",
          code: "invalid_sections",
        }),
        expect.objectContaining({
          title: "Broken From E2E B",
          code: "invalid_sections",
        }),
      ],
    }),
  );
});

test("the import page lists every failed template when none imported", async ({ page }) => {
  await signInAsAdmin(page);
  const saveFailure = "Could not save this template. Try importing it again.";
  const shapeFailure = "sections[0].items[0].contents[0].subItems: Expected array, received string";
  await page.route("**/api/templates/backup", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Template import failed",
        code: "template_import_failed",
        details: {
          total: 2,
          imported: 0,
          successes: [],
          failed: [
            { index: 0, title: "Launch plan", reason: saveFailure, code: "insert_failed" },
            { index: 1, title: "", reason: shapeFailure, code: "invalid_sections" },
          ],
        },
      }),
    });
  });

  await page.goto("/dashboard/import-templates");
  // The picker stays disabled until the template list and plan load; a file set on a
  // disabled input is ignored.
  const fileInput = page.locator("#template-file-input");
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: "launch-plan.json",
    mimeType: "application/json",
    // JSON imports take a backup, a portable pack, or an array of templates.
    buffer: Buffer.from(JSON.stringify([{
      title: "Launch plan",
      sections: [{ title: "Checklist", items: [{ title: "Check DNS" }] }],
    }])),
  });
  await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Import" }).click();

  await expect(page.getByText("Last Import Result")).toBeVisible();
  await expect(page.getByText("0 imported")).toBeVisible();
  await expect(page.getByText("2 failed")).toBeVisible();
  await expect(page.getByText(`Launch plan: ${saveFailure}`)).toBeVisible();
  await expect(page.getByText(`Template 2: ${shapeFailure}`)).toBeVisible();
  // The preview stays, so the file can be fixed and imported again.
  await expect(page.getByRole("button", { name: "Confirm Import" })).toBeVisible();
});
