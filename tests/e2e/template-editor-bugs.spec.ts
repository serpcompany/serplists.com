import { expect, test, type Page } from "@playwright/test";

const DEV_API_BASE_URL = "http://localhost:8788/api";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /fill admin/i }).click();
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await expect(page).toHaveURL(/\/account/);
}

async function findTemplateByTitle(page: Page, title: string) {
  return page.evaluate(async ({ templateTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/templates`, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Failed to load templates: ${response.status}`);
    }

    const templates = (await response.json()) as Array<Record<string, unknown>>;
    return templates.find((template) => template.title === templateTitle) ?? null;
  }, { templateTitle: title, apiBaseUrl: DEV_API_BASE_URL });
}

async function deleteTemplate(page: Page, templateId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/templates/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
  }, { id: templateId, apiBaseUrl: DEV_API_BASE_URL });
}

test.describe("template editor regressions", () => {
  test("adds tags and categories before save and persists them", async ({ page }) => {
    const templateTitle = `QA Tags ${Date.now()}`;
    const tagName = `tag-${Date.now()}`;
    const categoryName = `category-${Date.now()}`;
    let createdTemplateId: string | null = null;

    await signInAsAdmin(page);
    await page.goto("/dashboard/templates/new");

    await page.getByLabel("Template Title").fill(templateTitle);
    await page.getByPlaceholder("Add a tag...").fill(tagName);
    await page.getByPlaceholder("Add a tag...").press("Enter");
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();

    await page
      .getByPlaceholder("Type a category and press Enter or click + to add")
      .fill(categoryName);
    await page
      .getByPlaceholder("Type a category and press Enter or click + to add")
      .press("Enter");
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/console\/templates$/);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    createdTemplateId =
      savedTemplate && typeof savedTemplate.id === "string" ? savedTemplate.id : null;

    expect(savedTemplate).toBeTruthy();
    expect(savedTemplate?.tags).toContain(tagName);
    expect(savedTemplate?.categories).toContain(categoryName);

    if (createdTemplateId) {
      await deleteTemplate(page, createdTemplateId);
    }
  });

  test("saves SEO fields and reloads them in the editor", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA SEO ${stamp}`;
    const seoTitle = `SEO title ${stamp}`;
    const seoDescription = `SEO description ${stamp}`;
    const seoSlug = `qa-seo-${stamp}`;
    let createdTemplateId: string | null = null;

    await signInAsAdmin(page);
    await page.goto("/dashboard/templates/new");

    await page.getByLabel("Template Title").fill(templateTitle);
    await page.getByText("SEO & Meta").click();
    await page.getByLabel("SEO Title").fill(seoTitle);
    await page.getByLabel("Custom URL Slug").fill(seoSlug);
    await page.getByLabel("SEO Meta Description").fill(seoDescription);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/console\/templates$/);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    createdTemplateId =
      savedTemplate && typeof savedTemplate.id === "string" ? savedTemplate.id : null;

    expect(savedTemplate).toBeTruthy();
    expect(savedTemplate?.slug).toBe(seoSlug);
    expect(savedTemplate?.seoTitle).toBe(seoTitle);
    expect(savedTemplate?.seoDescription).toBe(seoDescription);

    if (!createdTemplateId) {
      throw new Error("Template ID missing after save");
    }

    await page.goto(`/dashboard/templates/${createdTemplateId}/edit`);
    await page.getByText("SEO & Meta").click();

    await expect(page.getByLabel("SEO Title")).toHaveValue(seoTitle);
    await expect(page.getByLabel("Custom URL Slug")).toHaveValue(seoSlug);
    await expect(page.getByLabel("SEO Meta Description")).toHaveValue(seoDescription);

    await deleteTemplate(page, createdTemplateId);
  });
});
