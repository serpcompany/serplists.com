import { expect, test, type Page } from "@playwright/test";

import { apiJson, apiRequest } from "./support/api-requests";
import { loginAsAdmin } from "./support/sign-in";
import {
  deleteTemplate,
  dragAndDropBefore,
  findTemplateByTitle,
  getTemplateSections,
  ONE_PIXEL_PNG,
  registerAccount,
  saveAndReturnToTemplates,
} from "./support/template-editor";

async function createRun(page: Page, body: Record<string, unknown>) {
  return (await apiJson<{ id: string }>(page, "/checklists", { method: "POST", body })).id;
}

test.describe("template editor regressions", () => {
  test('shows one task-level notes area and persists it on the run', async ({ page }) => {
    await loginAsAdmin(page);
    const runId = await createRun(page, {
      sections: [
        {
          id: 'notes-section',
          title: 'Outreach',
          items: [
            {
              id: 'notes-task',
              title: 'Send email',
              contents: [
                {
                  type: 'subItems',
                  value: '',
                  subItems: [{ id: 'notes-subtask', title: 'Wait for reply' }],
                },
              ],
            },
          ],
        },
      ],
      title: 'Run notes QA',
    });

    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByLabel('Task notes')).toHaveCount(1);
    await expect(page.getByLabel('Notes for Wait for reply')).toHaveCount(0);
    await page.getByLabel('Task notes').fill('Sent email: https://example.com/message/42');
    await page.getByLabel('Task notes').locator('..').getByRole('button', { name: 'Save notes' }).click();

    await page.reload();
    await expect(page.getByLabel('Task notes')).toHaveValue(
      'Sent email: https://example.com/message/42',
    );
  });

  test("@smoke preserves task edits when adding then switching between tasks", async ({ page }) => {
    const templateTitle = `QA Tasks ${Date.now()}`;
    const firstTaskTitle = `First task ${Date.now()}`;
    const secondTaskTitle = `Second task ${Date.now()}`;
    const firstTaskDescription = "First task details should not be overwritten";
    const secondTaskDescription = "Second task details should persist separately";
    let createdTemplateId: string | null = null;

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);

    await page.getByRole("button", {
      name: /add task to section 1/i,
    }).click();

    await expect(page.getByRole("button", { name: /^Task 1$/ })).toBeVisible();
    await page.getByLabel("Task Title").fill(firstTaskTitle);
    await page.getByLabel("Description (Optional)").fill(firstTaskDescription);

    await page.getByRole("button", { name: /^Add task$/ }).click();
    await expect(page.getByRole("button", { name: /^Task 2$/ })).toBeVisible();
    await expect(page.getByLabel("Task Title")).toHaveValue("");
    await expect(page.getByLabel("Description (Optional)")).toHaveValue("");

    await page.getByRole("button", { name: /^Task 2$/ }).click();
    await page.getByLabel("Task Title").fill(secondTaskTitle);
    await page.getByLabel("Description (Optional)").fill(secondTaskDescription);

    await expect(
      page.getByRole("button", { exact: true, name: firstTaskTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: secondTaskTitle }),
    ).toBeVisible();

    await page.getByRole("button", { exact: true, name: firstTaskTitle }).click();
    await expect(page.getByLabel("Task Title")).toHaveValue(firstTaskTitle);
    await expect(page.getByLabel("Description (Optional)")).toHaveValue(
      firstTaskDescription,
    );

    await page.getByRole("button", { exact: true, name: secondTaskTitle }).click();
    await expect(page.getByLabel("Task Title")).toHaveValue(secondTaskTitle);
    await expect(page.getByLabel("Description (Optional)")).toHaveValue(
      secondTaskDescription,
    );

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    createdTemplateId =
      savedTemplate && typeof savedTemplate.id === "string" ? savedTemplate.id : null;

    expect(savedTemplate).toBeTruthy();

    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: firstTaskDescription,
          title: firstTaskTitle,
        }),
        expect.objectContaining({
          description: secondTaskDescription,
          title: secondTaskTitle,
        }),
      ]),
    );

    if (createdTemplateId) {
      await deleteTemplate(page, createdTemplateId);
    }
  });

  test("@smoke adds and persists a text content block", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Content ${stamp}`;
    const taskTitle = `Task with content ${stamp}`;
    const contentLines = [
      `Markdown content block ${stamp}`,
      `Second display line ${stamp}`,
      `Third display line ${stamp}`,
    ];
    const contentValue = contentLines.join("\n");
    let createdTemplateId: string | null = null;

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", {
      name: /add task to section 1/i,
    }).click();
    await page.getByLabel("Task Title").fill(taskTitle);

    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();

    await expect(
      page.getByPlaceholder("Enter text or markdown content"),
    ).toBeVisible();
    await page
      .getByPlaceholder("Enter text or markdown content")
      .fill(contentValue);

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    createdTemplateId =
      savedTemplate && typeof savedTemplate.id === "string" ? savedTemplate.id : null;

    expect(savedTemplate).toBeTruthy();

    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items[0]?.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          value: contentValue,
        }),
      ]),
    );

    if (createdTemplateId) {
      await page.goto(`/dashboard/templates/${createdTemplateId}/`);
      const renderedContent = page.getByText(
        new RegExp(`${contentLines[0]}\\s+${contentLines[1]}\\s+${contentLines[2]}`),
      );
      await expect(renderedContent).toBeVisible();

      const whiteSpace = await renderedContent.evaluate((node) => {
        const container = node.closest(".whitespace-pre-line");
        return container ? getComputedStyle(container).whiteSpace : null;
      });
      expect(whiteSpace).toBe("pre-line");

      await deleteTemplate(page, createdTemplateId);
    }
  });

  test("previews a corrected image URL after a broken one, also when the URL is typed one key at a time", async ({ page }) => {
    await page.route("https://img.test/**", async (route) => {
      if (route.request().url().endsWith("/good.png")) {
        await route.fulfill({ body: ONE_PIXEL_PNG, contentType: "image/png" });
        return;
      }
      await route.fulfill({ body: "", status: 404 });
    });

    await loginAsAdmin(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Image", exact: true }).click();

    const urlField = page.getByLabel("Image URL");
    const preview = page.getByRole("img", { name: "Preview" });
    await urlField.fill("https://img.test/bad.png");
    await expect(page.getByText("Preview unavailable")).toBeVisible();
    await expect(preview).toHaveCount(0);

    await urlField.fill("https://img.test/good.png");
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    await urlField.fill("");
    await urlField.pressSequentially("https://img.test/good.png");
    await expect(preview).toBeVisible();
    await expect(page.getByText("Preview unavailable")).toHaveCount(0);
  });

  test("saves an untitled section as 'Section 1' and drops a trailing blank sub-task", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Blank titles ${stamp}`;

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with sub-tasks ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Sub-tasks", exact: true }).click();
    await page.getByPlaceholder("Sub-task 1").fill("Check title");
    await page.getByPlaceholder("Sub-task 1").press("Enter");
    await expect(page.getByPlaceholder("Sub-task 2")).toBeVisible();

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect((sections[0] as { title?: string }).title).toBe("Section 1");
    const subItems = (sections[0]?.items[0]?.contents?.[0] as { subItems?: Array<{ title: string }> })
      ?.subItems;
    expect(subItems?.map((subItem) => subItem.title)).toEqual(["Check title"]);

    const templateId = String(savedTemplate?.id);
    const runId = await createRun(page, { template_id: templateId, title: "Blank titles run", sections });

    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByText("Section 1", { exact: true }).first()).toBeVisible();
    const taskCheckbox = page.getByRole("checkbox", { name: `Mark "Task with sub-tasks ${stamp}" complete` });
    const itsOneSubTaskCheckbox = page.getByRole("checkbox", { name: "Check title", exact: true });
    await expect(taskCheckbox).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    await expect(itsOneSubTaskCheckbox).toBeVisible();
    await expect(page.getByText("Check title", { exact: true })).toBeVisible();

    await apiRequest(page, `/checklists/${runId}`, { method: "DELETE" });
    await deleteTemplate(page, templateId);
  });

  test("keeps focus while an embed URL is typed across the https:// prefix", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Embed ${stamp}`;
    const embedUrl = "https://www.loom.com/share/abc";

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with embed ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Embed", exact: true }).click();

    const field = page.getByLabel("Embed Code or URL");
    await field.click();
    await field.pressSequentially(embedUrl);
    await expect(field).toHaveValue(embedUrl);
    await expect(field).toBeFocused();
    await expect(page.getByText(`Embed URL: ${embedUrl}`)).toBeVisible();

    await field.press("End");
    for (let i = 0; i < embedUrl.length - "https:/".length; i += 1) {
      await field.press("Backspace");
    }
    await expect(field).toHaveValue("https:/");
    await expect(field).toBeFocused();

    await field.pressSequentially("/www.loom.com/share/abc");
    await expect(field).toHaveValue(embedUrl);
    await expect(field).toBeFocused();

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items[0]?.contents).toEqual([
      expect.objectContaining({ type: "embed", value: embedUrl }),
    ]);

    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });

  test("reorders content blocks by keyboard and by drag and saves the order", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Block order ${stamp}`;
    const embedUrl = "https://www.loom.com/share/order";

    await registerAccount(page);
    await page.goto("/dashboard/templates/new/");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with blocks ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();
    await page.getByPlaceholder("Enter text or markdown content").fill("Intro text");
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("menuitem", { name: "Embed", exact: true }).click();
    await page.getByLabel("Embed Code or URL").fill(embedUrl);

    const handles = page.getByRole("button", { name: /^Drag (Text|Embed) block$/ });
    await expect(handles).toHaveCount(2);

    const embedHandle = page.getByRole("button", { name: "Drag Embed block" });
    await embedHandle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(handles.first()).toHaveAccessibleName("Drag Embed block");
    await expect(embedHandle).toBeFocused();

    await dragAndDropBefore(page, page.getByRole("button", { name: "Drag Text block" }), embedHandle, "content-before");
    await expect(handles.first()).toHaveAccessibleName("Drag Text block");

    await embedHandle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(handles.first()).toHaveAccessibleName("Drag Embed block");

    await saveAndReturnToTemplates(page);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items[0]?.contents).toEqual([
      expect.objectContaining({ type: "embed", value: embedUrl }),
      expect.objectContaining({ type: "text", value: "Intro text" }),
    ]);

    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });
});
