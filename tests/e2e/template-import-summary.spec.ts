import { expect, test, type Page } from "@playwright/test";

const API_BASE_URL = process.env.VITE_API_URL ?? "http://localhost:8788/api";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /fill admin/i }).click();
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/account/);
}

test("template import API returns structured per-template failures for rejected imports", async ({ page }) => {
  await signInAsAdmin(page);

  const result = await page.evaluate(async (apiBase) => {
    const response = await fetch(`${apiBase}/templates/backup`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    return {
      status: response.status,
      data,
    };
  }, API_BASE_URL);

  expect(result.status).toBe(400);
  expect(result.data.code).toBe("template_import_failed");
  expect(result.data.details).toEqual(
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
