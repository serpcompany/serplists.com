import { expect, test, type Page } from "@playwright/test";

import { apiJson } from "./support/api-requests";
import { loginAsAdmin } from "./support/sign-in";
import {
  createTemplate,
  createTwoTaskTemplate,
  deleteTemplate,
  dragAndDropBefore,
  findTemplateByTitle,
  uniqueSuffix,
} from "./support/template-editor";

type HeaderWatchWindow = Window & { __sawNewTemplate?: boolean };

async function recordWhetherTheHeaderShowsNewTemplate(page: Page) {
  await page.addInitScript(() => {
    const w = window as HeaderWatchWindow;
    w.__sawNewTemplate = false;
    new MutationObserver(() => {
      const headers = Array.from(document.querySelectorAll("header"));
      if (headers.some((header) => header.textContent?.includes("New Template"))) {
        w.__sawNewTemplate = true;
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

async function headerShowedNewTemplate(page: Page) {
  return page.evaluate(() => (window as HeaderWatchWindow).__sawNewTemplate);
}

async function addATaskFromAnotherTab(page: Page, templateId: string) {
  const template = await apiJson<{ sections: Array<{ items: unknown[] }>; version: number }>(
    page,
    `/templates/${templateId}`,
  );
  const { sections } = template;
  sections[0].items.push({ id: "added-elsewhere", title: "Added elsewhere", description: "" });
  await apiJson(page, `/templates/${templateId}`, {
    method: "PUT",
    body: { sections, expected_version: template.version },
  });
}

test.describe("template editor regressions", () => {
  test('reorders sections and tasks with the visible drag handles', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/templates/new/');

    await page.getByRole('button', { name: /add task to section 1/i }).click();
    await page.getByLabel('Task Title').fill('First task');
    await page.getByRole('button', { name: /^Add task$/ }).click();
    await page.getByLabel('Task Title').fill('Second task');
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByPlaceholder('Enter section title...').fill('Second section');

    await dragAndDropBefore(
      page,
      page.getByRole('button', { name: 'Drag Second section' }),
      page.getByRole('button', { name: 'Drag Section 1' }),
      'section-before',
    );
    const sectionHandles = page.getByRole('button', { name: /^Drag / });
    await expect(sectionHandles.first()).toHaveAccessibleName('Drag Second section');

    await page.getByRole('button', { name: 'Drag Second task' }).dragTo(
      page.getByRole('button', { name: 'Drag First task' }),
    );
    const taskButtons = page.getByRole('button', { name: /^(First|Second) task$/ });
    await expect(taskButtons.first()).toHaveText('Second task');
  });

  test('shows outline actions on keyboard focus, and reorders with the arrow keys keeping focus on the moved handle', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/templates/new/');

    await page.getByRole('button', { name: /add task to section 1/i }).click();
    await page.getByLabel('Task Title').fill('First task');
    await page.getByRole('button', { name: /^Add task$/ }).click();
    await page.getByLabel('Task Title').fill('Second task');
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByLabel('Section Title').fill('Second section');

    await page.getByRole('button', { name: 'Section 1', exact: true }).focus();
    await page.keyboard.press('Tab');
    const addTask = page.getByRole('button', { name: 'Add task to Section 1' });
    await expect(addTask).toBeFocused();
    await expect(addTask.locator('..')).toHaveCSS('opacity', '1');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Remove Section 1' })).toBeFocused();

    const sectionHandle = page.getByRole('button', { name: 'Drag Second section' });
    await sectionHandle.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('button', { name: /^Drag / }).first()).toHaveAccessibleName('Drag Second section');
    await expect(sectionHandle).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Moved Second section' })).toHaveText(
      'Moved Second section to position 1 of 2',
    );

    const taskHandle = page.getByRole('button', { name: 'Drag First task' });
    await taskHandle.focus();
    await page.keyboard.press('ArrowDown');
    const taskButtons = page.getByRole('button', { name: /^(First|Second) task$/ });
    await expect(taskButtons.first()).toHaveText('Second task');
    await expect(taskHandle).toBeFocused();
  });

  test('previews the current unsaved template draft', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/templates/new/');
    await page.getByPlaceholder('Enter template name...').fill('Unsaved preview title');

    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.getByRole('dialog')).toContainText('Unsaved preview title');
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
  });

  test("opens every section of a saved template expanded, from the first frame", async ({ page }) => {
    await loginAsAdmin(page);
    const stamp = Date.now();
    const templateTitle = `QA Outline ${stamp}`;
    const sectionTitles = ["Before the move", "Moving day", "After the move"];
    const templateId = await createTemplate(page, {
      title: templateTitle,
      is_public: false,
      sections: sectionTitles.map((sectionTitle, index) => ({
        id: `outline-section-${index}`,
        title: sectionTitle,
        items: [{ id: `outline-task-${index}`, title: `${sectionTitle} task`, description: "" }],
      })),
    });

    await recordWhetherTheHeaderShowsNewTemplate(page);

    await page.goto(`/dashboard/templates/${templateId}/edit/`);
    for (const title of sectionTitles) {
      await expect(page.getByRole("button", { name: `Collapse ${title}` })).toBeVisible();
      await expect(page.getByRole("button", { name: `${title} task`, exact: true })).toBeVisible();
    }
    expect(await headerShowedNewTemplate(page)).toBe(false);

    await deleteTemplate(page, templateId);
  });

  test("opens the latest saved template, not the cached list copy", async ({ page }) => {
    await loginAsAdmin(page);
    const title = `Concurrent edit ${uniqueSuffix()}`;
    const templateId = await createTwoTaskTemplate(page, title);

    try {
      await page.goto("/dashboard/templates/");
      await page.getByRole("link", { name: title }).first().click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${templateId}/$`));

      await addATaskFromAnotherTab(page, templateId);

      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await expect(page.getByText("Added elsewhere").first()).toBeVisible();

      await page.getByPlaceholder("Enter template name...").fill(`${title} edited`);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Template saved", { exact: true })).toBeVisible();

      const saved = await findTemplateByTitle(page, `${title} edited`);
      expect(JSON.stringify(saved?.sections)).toContain("Added elsewhere");
    } finally {
      await deleteTemplate(page, templateId);
    }
  });
});
