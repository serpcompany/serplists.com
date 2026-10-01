import { expect, test } from "@playwright/test";

import { apiRequest } from "./support/api-requests";
import { loginAsAdmin } from "./support/sign-in";

const templatesArrayJson = JSON.stringify([{
  title: "Launch plan",
  sections: [{ title: "Checklist", items: [{ title: "Check DNS" }] }],
}]);

test("template import API returns structured per-template failures for rejected imports", async ({ page }) => {
  await loginAsAdmin(page);

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

test("the import page lists every failed template when none imported, and keeps the preview for another try", async ({ page }) => {
  await loginAsAdmin(page);
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

  await page.goto("/dashboard/import-templates/");
  const fileInput = page.locator("#template-file-input");
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: "launch-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(templatesArrayJson),
  });
  await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Import" }).click();

  await expect(page.getByText("Last Import Result")).toBeVisible();
  await expect(page.getByText("0 imported")).toBeVisible();
  await expect(page.getByText("2 failed")).toBeVisible();
  await expect(page.getByText(`Launch plan: ${saveFailure}`)).toBeVisible();
  await expect(page.getByText(`Template 2: ${shapeFailure}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Import" })).toBeVisible();
});
