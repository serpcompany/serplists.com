import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

import { dismissTheNextConfirm } from "./support/navigation";
import { loginAsAdmin } from "./support/sign-in";
import {
  createTemplate,
  createTwoTaskTemplate,
  deleteTemplate,
  findTemplateByTitle,
  getTemplateSections,
  holdUntilReleased,
  saveAndReturnToTemplates,
  saveAndWaitUntilSaved,
  uniqueSuffix,
} from "./support/template-editor";

const updateBodySchema = z.object({ expected_version: z.unknown() });

async function holdTheFirstUpdate(page: Page, templateId: string, released: Promise<void>) {
  const expectedVersionsSent: unknown[] = [];
  let heldOnce = false;
  await page.route(`**/api/templates/${templateId}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }
    expectedVersionsSent.push(updateBodySchema.parse(route.request().postDataJSON()).expected_version);
    if (!heldOnce) {
      heldOnce = true;
      await released;
    }
    await route.fallback();
  });
  return expectedVersionsSent;
}

async function holdTheUpdateThenRefuseItAsAConflict(page: Page, templateId: string, released: Promise<void>) {
  await page.route(`**/api/templates/${templateId}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }
    await released;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Template changed since it was loaded. Refresh before saving again.",
        code: "edit_conflict",
      }),
    });
  });
}

async function warnsBeforeUnload(page: Page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test.describe("template editor regressions", () => {
  test("keeps edits typed while a save is in flight, and saves them next on the version that save returned", async ({ page }) => {
    await loginAsAdmin(page);
    const templateTitle = `QA Save race ${Date.now()}`;
    const templateId = await createTwoTaskTemplate(page, templateTitle);
    const firstUpdate = holdUntilReleased();
    const expectedVersionsSent = await holdTheFirstUpdate(page, templateId, firstUpdate.held);

    await page.goto(`/dashboard/templates/${templateId}/edit/`);
    await page.getByRole("button", { exact: true, name: "First task" }).click();
    await page.getByLabel("Description (Optional)").fill("Sent with the first save");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
    await page.getByLabel("Description (Optional)").fill("Sent with the first save, then more");
    await page.getByRole("button", { exact: true, name: "Second task" }).click();
    await page.getByLabel("Description (Optional)").fill("Typed into another task");

    firstUpdate.release();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    await expect(page.getByLabel("Description (Optional)")).toHaveValue("Typed into another task");
    await page.getByRole("button", { exact: true, name: "First task" }).click();
    await expect(page.getByLabel("Description (Optional)")).toHaveValue(
      "Sent with the first save, then more",
    );

    const confirmMessage = dismissTheNextConfirm(page);
    await page.getByRole("button", { name: "Back to templates" }).click();
    await expect.poll(confirmMessage).toContain("unsaved template changes");
    await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${templateId}/edit/$`));

    await saveAndWaitUntilSaved(page);
    expect(expectedVersionsSent).toHaveLength(2);
    expect(Number(expectedVersionsSent[1])).toBeGreaterThan(Number(expectedVersionsSent[0]));

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items.map((item) => item.description)).toEqual([
      "Sent with the first save, then more",
      "Typed into another task",
    ]);

    await deleteTemplate(page, templateId);
  });

  test("asks once before unsaved template edits are lost through the app shell, Back, Sign out or the editor's own back button", async ({ page }) => {
    await loginAsAdmin(page);
    const templateTitle = `QA Leave guard ${Date.now()}`;
    const templateId = await createTwoTaskTemplate(page, templateTitle);
    const editorUrl = new RegExp(`/dashboard/templates/${templateId}/edit/$`);
    const draft = "Edited but not saved";
    const dialogs: string[] = [];
    let acceptDialogs = false;
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await (acceptDialogs ? dialog.accept() : dialog.dismiss());
    });

    await page.goto(`/dashboard/templates/${templateId}/`);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(editorUrl);
    await page.getByRole("button", { exact: true, name: "First task" }).click();
    await page.getByLabel("Description (Optional)").fill(draft);

    const expectStillEditing = async (asked: number) => {
      await expect.poll(() => dialogs.length).toBe(asked);
      expect(dialogs.at(-1)).toContain("unsaved template changes");
      await expect(page).toHaveURL(editorUrl);
      await expect(page.getByLabel("Description (Optional)")).toHaveValue(draft);
    };

    await page.getByRole("link", { name: "Runs", exact: true }).click();
    await expectStillEditing(1);

    await page.goBack();
    await expectStillEditing(2);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "My Runs" }).click();
    await expectStillEditing(3);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expectStillEditing(4);
    await expect(page.getByRole("button", { name: "Switch context" })).toBeVisible();

    await page.getByRole("button", { name: "Back to templates" }).click();
    await expectStillEditing(5);

    acceptDialogs = true;
    await page.getByRole("link", { name: "Runs", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
    expect(dialogs).toHaveLength(6);

    await deleteTemplate(page, templateId);
  });

  test("asks before leaving while a save is in flight, and keeps the edits if it fails", async ({ page }) => {
    await loginAsAdmin(page);
    const templateTitle = `QA Leave during save ${Date.now()}`;
    const templateId = await createTwoTaskTemplate(page, templateTitle);
    const editorUrl = new RegExp(`/dashboard/templates/${templateId}/edit/$`);
    const draft = "Typed before a save that fails";
    const update = holdUntilReleased();
    await holdTheUpdateThenRefuseItAsAConflict(page, templateId, update.held);
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(`/dashboard/templates/${templateId}/edit/`);
    await page.getByRole("button", { exact: true, name: "First task" }).click();
    await page.getByLabel("Description (Optional)").fill(draft);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();

    await page.getByRole("button", { name: "Back to templates" }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain("still saving");
    await expect(page).toHaveURL(editorUrl);
    expect(await warnsBeforeUnload(page)).toBe(true);

    update.release();
    await expect(page.getByText("Template changed since it was loaded.").first()).toBeVisible();
    await expect(page).toHaveURL(editorUrl);
    await expect(page.getByLabel("Description (Optional)")).toHaveValue(draft);

    await page.unroute(`**/api/templates/${templateId}`);
    await deleteTemplate(page, templateId);
  });

  test("stays where the user went when a create finishes after they left", async ({ page }) => {
    await loginAsAdmin(page);
    const templateTitle = `QA Leave during create ${Date.now()}`;
    const create = holdUntilReleased();
    let createFinished = false;
    await page.route("**/api/templates", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await create.held;
      await route.fallback();
      createFinished = true;
    });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
    await page.getByRole("link", { name: "Runs", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/runs\/$/);

    create.release();
    await expect.poll(() => createFinished).toBe(true);
    await expect.poll(() => findTemplateByTitle(page, templateTitle)).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard\/runs\/$/);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });

  test("leaves a new template without asking once it is saved", async ({ page }) => {
    await loginAsAdmin(page);
    const templateTitle = `QA Leave after create ${Date.now()}`;
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await saveAndReturnToTemplates(page);
    expect(dialogs).toEqual([]);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });
});

test.describe("template editor route switches", () => {
  async function createTemplateAndOpenItsEditor(page: Page) {
    const title = `Route switch QA ${uniqueSuffix()}`;
    const templateId = await createTemplate(page, {
      title,
      sections: [{ id: "route-section", title: "Section", items: [{ id: "route-task", title: "Task" }] }],
    });
    await page.goto(`/dashboard/templates/${templateId}/edit/`);
    await expect(page.getByPlaceholder("Enter template name...")).toHaveValue(title);
    return { templateId, title };
  }

  test("a failed save does not follow the user to the new-template form", async ({ page }) => {
    await loginAsAdmin(page);
    const { templateId } = await createTemplateAndOpenItsEditor(page);
    await page.route(`**/api/templates/${templateId}`, (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 409,
            json: { error: "Template changed since it was loaded. Refresh before saving again.", code: "edit_conflict" },
          })
        : route.continue(),
    );

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Template changed since it was loaded.")).toBeVisible();
    await page.getByRole("link", { name: "New Template" }).first().click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
    await expect(page.getByPlaceholder("Enter template name...")).toHaveValue("");
    await expect(page.getByText("Template changed since it was loaded.")).toHaveCount(0);
    await page.unroute(`**/api/templates/${templateId}`);
    await deleteTemplate(page, templateId);
  });

  test("a save that finishes after New Template does not fill the new form", async ({ page }) => {
    await loginAsAdmin(page);
    const { templateId } = await createTemplateAndOpenItsEditor(page);
    const save = holdUntilReleased();
    await page.route(`**/api/templates/${templateId}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      await save.held;
      return route.continue();
    });
    const creates: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/api/templates")) creates.push(request.url());
    });

    const saved = page.waitForResponse(
      (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("link", { name: "New Template" }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
    save.release();
    expect((await saved).status()).toBe(200);

    await expect(page.getByText("Template saved")).toBeVisible();
    await expect(page.getByPlaceholder("Enter template name...")).toHaveValue("");
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
    expect(creates).toEqual([]);
    await page.unroute(`**/api/templates/${templateId}`);
    await deleteTemplate(page, templateId);
  });
});
