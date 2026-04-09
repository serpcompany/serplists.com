import { expect, test, type Page } from "@playwright/test";

const DEV_API_BASE_URL = "http://localhost:8788/api";

async function signInAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /admin \(pro\)/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
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

    await page.getByLabel("Template name").fill(templateTitle);
    await page.getByLabel("Tags").fill(tagName);
    await page.getByLabel("Tags").press("Enter");
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();

    await page.getByLabel("Categories").fill(categoryName);
    await page.getByLabel("Categories").press("Enter");
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

    await page.getByLabel("Template name").fill(templateTitle);
    await page.getByRole("button", { name: /search preview/i }).click();
    await page.getByLabel("Search title").fill(seoTitle);
    await page.getByLabel("URL slug").fill(seoSlug);
    await page.getByLabel("Search description").fill(seoDescription);

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
    await page.getByRole("button", { name: /search preview/i }).click();

    await expect(page.getByLabel("Search title")).toHaveValue(seoTitle);
    await expect(page.getByLabel("URL slug")).toHaveValue(seoSlug);
    await expect(page.getByLabel("Search description")).toHaveValue(seoDescription);

    await deleteTemplate(page, createdTemplateId);
  });
});
