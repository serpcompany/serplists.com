import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

import { loginAsAdmin } from "./support/sign-in";
import {
  createTemplate,
  deleteTemplate,
  findTemplateByTitle,
  getTemplateSections,
  registerAccount,
  saveAndReturnToTemplates,
  uniqueSuffix,
} from "./support/template-editor";

const storedTemplateSchema = z
  .object({
    sections: z.array(
      z.object({ items: z.array(z.object({ contents: z.array(z.unknown()) }).passthrough()) }).passthrough(),
    ),
  })
  .passthrough();

async function serveAsARowFromBeforeTheBlockTypeCheck(page: Page, templateId: string) {
  await page.route(`**/api/templates/${templateId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const template = storedTemplateSchema.parse(await response.json());
    template.sections[0].items[0].contents.push({ id: "c3", type: "link", value: "https://example.com" });
    await route.fulfill({ response, json: template });
  });
}

test.describe("template editor regressions", () => {
  test("adds tags and categories before save and persists them", async ({ page }) => {
    const templateTitle = `QA Tags ${Date.now()}`;
    const tagName = `tag-${Date.now()}`;
    const categoryName = "camping";
    let createdTemplateId: string | null = null;

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByPlaceholder("Add tag...").fill(tagName);
    await page.getByPlaceholder("Add tag...").press("Enter");
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();

    await page.getByText("Select categories...").click();
    await page.getByRole("option", { name: categoryName }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText(categoryName, { exact: true }).first()).toBeVisible();

    await saveAndReturnToTemplates(page);

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

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /search & seo/i }).click();
    await page.getByPlaceholder("Title for search results...").fill(seoTitle);
    await page.getByPlaceholder("my-template-slug").fill(seoSlug);
    await page
      .getByPlaceholder("Description shown in search results...")
      .fill(seoDescription);

    await saveAndReturnToTemplates(page);

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

    await page.goto(`/dashboard/templates/${createdTemplateId}/edit/`);
    await page.getByRole("button", { name: /search & seo/i }).click();

    await expect(page.getByPlaceholder("Title for search results...")).toHaveValue(seoTitle);
    await expect(page.getByPlaceholder("my-template-slug")).toHaveValue(seoSlug);
    await expect(
      page.getByPlaceholder("Description shown in search results..."),
    ).toHaveValue(seoDescription);

    await deleteTemplate(page, createdTemplateId);
  });

  test("saves a template whose stored content came from a legacy import, keeping a block of unknown type as text", async ({ page }) => {
    await loginAsAdmin(page);
    const title = `Legacy content ${uniqueSuffix()}`;
    const templateId = await createTemplate(page, {
      title,
      is_public: false,
      sections: [
        {
          id: "legacy-section",
          title: "Prep",
          items: [
            {
              id: "legacy-task",
              title: "Legacy task",
              contents: [
                { id: 1, type: "text", value: "Numeric id" },
                { type: "file", value: "https://example.com/doc.pdf", fileName: null, fileSize: null },
              ],
            },
          ],
        },
      ],
    });
    await serveAsARowFromBeforeTheBlockTypeCheck(page, templateId);

    try {
      await page.goto(`/dashboard/templates/${templateId}/edit/`);
      await page.getByPlaceholder("Enter template name...").fill(`${title} saved`);
      await page.getByRole("button", { name: "Save", exact: true }).click();

      await expect(page.getByText("Template saved", { exact: true })).toBeVisible();
      const saved = await findTemplateByTitle(page, `${title} saved`);
      expect(JSON.stringify(saved?.sections)).toContain("https://example.com/doc.pdf");
      const contents = getTemplateSections(saved as Record<string, unknown>)[0]?.items[0]?.contents;
      expect(contents).toContainEqual(expect.objectContaining({ type: "text", value: "https://example.com" }));
    } finally {
      await page.unrouteAll({ behavior: "wait" });
      await deleteTemplate(page, templateId);
    }
  });
});
