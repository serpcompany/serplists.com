import { expect, type Locator, type Page } from "@playwright/test";

import { apiJson, apiRequest } from "./api-requests";

const PASSWORD = "Aa!template-editor-password-12345";
export const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerAccount(page: Page) {
  const suffix = uniqueSuffix();

  await page.goto("/register/");
  await page.getByLabel("Name").fill("Template Editor QA");
  await page.getByLabel("Email").fill(`template-editor+${suffix}@e2e.local`);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Switch context" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function findTemplateByTitle(page: Page, title: string) {
  const templates = await apiJson<Array<Record<string, unknown>>>(page, "/templates?scope=personal");
  return templates.find((template) => template.title === title) ?? null;
}

export async function deleteTemplate(page: Page, templateId: string) {
  await apiRequest(page, `/templates/${templateId}`, { method: "DELETE" });
}

export async function createTemplate(page: Page, body: Record<string, unknown>) {
  return (await apiJson<{ id: string }>(page, "/templates", { method: "POST", body })).id;
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

export function getTemplateSections(template: Record<string, unknown>) {
  const rawSections = template.sections ?? template.items ?? [];
  const parsedSections =
    typeof rawSections === "string" ? JSON.parse(rawSections) : rawSections;

  if (!Array.isArray(parsedSections)) {
    return [];
  }

  const firstEntry = parsedSections[0] as { items?: unknown } | undefined;
  if (firstEntry && Array.isArray(firstEntry.items)) {
    return parsedSections as Array<{
      items: Array<{
        contents?: Array<{ type?: string; value?: string }>;
        description?: string;
        title?: string;
      }>;
    }>;
  }

  return [
    {
      items: parsedSections as Array<{
        contents?: Array<{ type?: string; value?: string }>;
        description?: string;
        title?: string;
      }>,
    },
  ];
}
