import { expect, type Locator, type Page } from "@playwright/test";
import { z } from "zod";

import { apiJson, apiRequest, bodyNotRead } from "./api-requests";
import { apiTemplateRows, savedTemplateSchema } from "./api-bodies";
import { registerNewAccount, uniqueSuffix } from "./sign-in";

const PASSWORD = "Aa!template-editor-password-12345";
export const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export { uniqueSuffix };

async function registerAccount(page: Page) {
  await registerNewAccount(page, {
    name: "Template Editor QA",
    email: `template-editor+${uniqueSuffix()}@e2e.local`,
    password: PASSWORD,
  });
}

export async function findTemplateByTitle(page: Page, title: string) {
  const templates = await apiJson(page, "/templates?scope=personal", apiTemplateRows);
  return templates.find((template) => template.title === title) ?? null;
}

export async function deleteTemplate(page: Page, templateId: string) {
  await apiRequest(page, `/templates/${templateId}`, bodyNotRead, { method: "DELETE" });
}

export async function createTemplate(page: Page, body: Record<string, unknown>) {
  return (await apiJson(page, "/templates", savedTemplateSchema, { method: "POST", body })).id;
}

export async function createTwoTaskTemplate(page: Page, title: string) {
  return createTemplate(page, {
    title,
    is_public: false,
    sections: [
      {
        id: "guard-section",
        title: "Prep",
        items: [
          { id: "guard-task-1", title: "First task", description: "" },
          { id: "guard-task-2", title: "Second task", description: "" },
        ],
      },
    ],
  });
}

export async function saveAndReturnToTemplates(page: Page) {
  const saveAnswered = page.waitForResponse((response) => {
    const method = response.request().method();
    const { pathname } = new URL(response.url());
    return (method === "POST" || method === "PUT") && /\/api\/templates(\/[^/]+)?$/.test(pathname);
  });
  await page.getByRole("button", { name: "Save" }).click();
  expect((await saveAnswered).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
}

export async function saveAndWaitUntilSaved(page: Page) {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
}

export function holdUntilReleased() {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

export async function dragAndDropBefore(page: Page, dragged: Locator, target: Locator, dropIndicator: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await dragged.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await expect(page.locator(`[data-drop-indicator="${dropIndicator}"]`)).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer });
}

const savedTask = z
  .object({
    contents: z
      .array(
        z
          .object({
            type: z.string().nullish(),
            value: z.string().nullish(),
            subItems: z.array(z.object({ title: z.string() }).passthrough()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    description: z.string().nullish(),
    title: z.string().nullish(),
  })
  .passthrough();

const savedSections = z.array(z.object({ title: z.string().nullish(), items: z.array(savedTask) }).passthrough());

const aSection = z.object({ items: z.array(z.unknown()) }).passthrough();

export function getTemplateSections(template: { sections?: unknown; items?: unknown }) {
  const rawSections = template.sections ?? template.items ?? [];
  const parsed: unknown = typeof rawSections === "string" ? JSON.parse(rawSections) : rawSections;
  const entries = z.array(z.unknown()).safeParse(parsed);
  if (!entries.success) return [];
  if (aSection.safeParse(entries.data[0]).success) return savedSections.parse(entries.data);
  return [{ items: z.array(savedTask).parse(entries.data) }];
}

export const ONE_TASK_SECTIONS = [{ id: "section-1", title: "Section", items: [{ id: "item-1", title: "Task" }] }];

export async function createOneTaskTemplate(page: Page, title: string, isPublic: boolean) {
  return createTemplate(page, { title, is_public: isPublic, sections: ONE_TASK_SECTIONS });
}

export async function confirmTheTemplateDelete(page: Page, templateId: string, dialog: Locator = page.getByRole("alertdialog")) {
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === "DELETE",
  );
  await dialog.getByRole("button", { name: "Delete" }).click();
  expect((await deleted).status()).toBe(200);
}

export async function startANewTemplate(page: Page, templateTitle: string) {
  await registerAccount(page);
  await page.goto("/dashboard/templates/new/");
  await page.getByPlaceholder("Enter template name...").fill(templateTitle);
}

export async function startANewTemplateWithATask(page: Page, templateTitle: string) {
  await startANewTemplate(page, templateTitle);
  await page.getByRole("button", { name: /add task to section 1/i }).click();
}

export async function addABlock(page: Page, kind: string) {
  await page.getByRole("button", { name: "Add Block" }).last().click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
}

export async function saveAndFindTheSavedTemplate(page: Page, templateTitle: string) {
  await saveAndReturnToTemplates(page);
  const savedTemplate = await findTemplateByTitle(page, templateTitle);
  expect(savedTemplate).toBeTruthy();
  return savedTemplate;
}

export async function saveAndReadTheSavedSections(page: Page, templateTitle: string) {
  const savedTemplate = await saveAndFindTheSavedTemplate(page, templateTitle);
  return { savedTemplate, sections: getTemplateSections(savedTemplate ?? {}) };
}

export async function deleteTheSavedTemplate(page: Page, savedTemplate: { id: string } | null) {
  if (savedTemplate) {
    await deleteTemplate(page, savedTemplate.id);
  }
}

export async function expectTheFirstTaskSavedWithBlocks(
  page: Page,
  templateTitle: string,
  blocks: Array<{ type: string; value: string }>,
) {
  const { savedTemplate, sections } = await saveAndReadTheSavedSections(page, templateTitle);
  expect(sections[0]?.items[0]?.contents).toEqual(blocks.map((block) => expect.objectContaining(block)));
  await deleteTheSavedTemplate(page, savedTemplate);
}
