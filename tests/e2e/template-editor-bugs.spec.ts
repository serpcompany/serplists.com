import { expect, test, type Page } from "@playwright/test";

const DEV_API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";
const PASSWORD = "Aa!template-editor-password-12345";

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerAccount(page: Page) {
  const suffix = uniqueSuffix();

  await page.goto("/register");
  await page.getByLabel("Name").fill("Template Editor QA");
  await page.getByLabel("Email").fill(`template-editor+${suffix}@e2e.local`);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Switch context" })).toBeVisible({
    timeout: 30_000,
  });
}

// Admin is a Pro persona created by `seed-test`, which the isolated e2e database runs.
async function loginAsSeedUser(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({
    timeout: 30_000,
  });
}

async function findTemplateByTitle(page: Page, title: string) {
  return page.evaluate(async ({ templateTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/templates?scope=personal`, { credentials: "include" });
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

function getTemplateSections(template: Record<string, unknown>) {
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

test.describe("template editor regressions", () => {
  test('remembers the signed-in user layout independently on template screens', async ({ page }) => {
    await loginAsSeedUser(page);
    await page.goto('/dashboard/templates');

    await page.getByRole('button', { name: 'Show templates in list view' }).click();
    await expect(
      page.getByRole('button', { name: 'Show templates in list view' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Show templates in list view' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/categories/seo');
    await expect(
      page.getByRole('button', { name: 'Show templates in grid view' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Show templates in list view' }).click();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Show templates in list view' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('supports full-size console navigation targets', async ({ page }) => {
    await loginAsSeedUser(page);
    await page.goto('/dashboard/templates');

    const runsLink = page.getByRole('link', { name: 'Runs', exact: true });
    const box = await runsLink.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await runsLink.click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(/\/dashboard\/runs$/);
  });

  test('reorders sections and tasks with the visible drag handles', async ({ page }) => {
    await loginAsSeedUser(page);
    await page.goto('/dashboard/templates/new');

    await page.getByRole('button', { name: /add task to section 1/i }).click();
    await page.getByLabel('Task Title').fill('First task');
    await page.getByRole('button', { name: /^Add task$/ }).click();
    await page.getByLabel('Task Title').fill('Second task');
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByPlaceholder('Enter section title...').fill('Second section');

    const draggedSection = page.getByRole('button', { name: 'Drag Second section' });
    const sectionDropTarget = page.getByRole('button', { name: 'Drag Section 1' });
    const sectionDataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await draggedSection.dispatchEvent('dragstart', { dataTransfer: sectionDataTransfer });
    await sectionDropTarget.dispatchEvent('dragover', { dataTransfer: sectionDataTransfer });
    await expect(page.locator('[data-drop-indicator="section-before"]')).toBeVisible();
    await sectionDropTarget.dispatchEvent('drop', { dataTransfer: sectionDataTransfer });
    const sectionHandles = page.getByRole('button', { name: /^Drag / });
    await expect(sectionHandles.first()).toHaveAccessibleName('Drag Second section');

    await page.getByRole('button', { name: 'Drag Second task' }).dragTo(
      page.getByRole('button', { name: 'Drag First task' }),
    );
    const taskButtons = page.getByRole('button', { name: /^(First|Second) task$/ });
    await expect(taskButtons.first()).toHaveText('Second task');
  });

  test('previews the current unsaved template draft', async ({ page }) => {
    await loginAsSeedUser(page);
    await page.goto('/dashboard/templates/new');
    await page.getByPlaceholder('Enter template name...').fill('Unsaved preview title');

    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.getByRole('dialog')).toContainText('Unsaved preview title');
    await expect(page).toHaveURL(/\/dashboard\/templates\/new$/);
  });

  test('reviews, edits, previews, and explicitly publishes a generated Clipy draft', async ({ page }) => {
    await loginAsSeedUser(page);
    let createPayload: Record<string, unknown> | null = null;
    await page.route('**/api/templates', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      createPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'clipy-template-1', slug: 'reviewed-clipy-checklist' }),
      });
    });
    await page.route('**/api/templates/generate-from-clipy', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          draft: {
            title: 'Creating Issues In GitHub Repositories',
            description: 'Create a clear issue.\n\nSource: https://clipy.online/video/8fptqlnappr6',
            templateType: 'checklist',
            categories: [],
            tags: ['Clipy'],
            isPublic: false,
            seoTitle: '',
            seoDescription: '',
            seoUrl: '',
            sections: [
              {
                id: 'clipy_8fptqlnappr6_steps',
                title: 'Steps',
                items: [
                  {
                    id: 'clipy_8fptqlnappr6_source',
                    title: 'Watch the source recording',
                    description: 'Review the original walkthrough.',
                    contents: [
                      {
                        id: 'clipy_8fptqlnappr6_video',
                        type: 'video',
                        uploadType: 'url',
                        value: 'https://clipy.online/video/8fptqlnappr6?ref=m4d8e9p&utm_source=serplists.com',
                      },
                      {
                        id: 'clipy_8fptqlnappr6_text',
                        type: 'text',
                        value: '### Recording summary\nCreate a clear issue.\n\n### Transcript\nOpen the repository.',
                      },
                    ],
                  },
                  {
                    id: 'clipy_8fptqlnappr6_step_1',
                    title: 'Navigate to the repository issues tab.',
                    description: '',
                    contents: [{
                      id: 'clipy_8fptqlnappr6_step_1_image',
                      type: 'image',
                      uploadType: 'url',
                      value: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
                    }],
                  },
                ],
              },
            ],
          },
        }),
      });
    });

    await page.goto('/dashboard/templates/new');
    await page.getByLabel('Public Clipy video link').fill(
      'https://clipy.online/video/8fptqlnappr6',
    );
    await page.getByRole('button', { name: 'Generate draft' }).click();

    await expect(page.getByPlaceholder('Enter template name...')).toHaveValue(
      'Creating Issues In GitHub Repositories',
    );
    await expect(
      page.getByRole('button', { name: 'Watch the source recording', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Navigate to the repository issues tab.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/templates\/new$/);
    expect(createPayload).toBeNull();

    await page.getByPlaceholder('Enter template name...').fill('Reviewed Clipy Checklist');
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.getByRole('dialog', { name: 'Template preview' });
    await expect(preview.getByText('Reviewed Clipy Checklist')).toBeVisible();
    await expect(preview.getByText('Recording summary')).toBeVisible();
    await expect(preview.getByText('Transcript')).toBeVisible();
    await expect(preview.locator('iframe[src*="clipy.online/embed/8fptqlnappr6"]')).toBeVisible();
    await expect(preview.locator('img[src*="cdn.clipy.online/key-moments/demo/issues.jpg"]')).toBeVisible();
    expect(createPayload).toBeNull();
    await preview.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('switch').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);
    expect(createPayload).toMatchObject({
      title: 'Reviewed Clipy Checklist',
      is_public: true,
    });
  });

  test('shows one task-level notes area and persists it on the run', async ({ page }) => {
    await loginAsSeedUser(page);
    const runId = await page.evaluate(async ({ apiBaseUrl }) => {
      const response = await fetch(`${apiBaseUrl}/checklists`, {
        body: JSON.stringify({
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
        }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to create run: ${response.status}`);
      return ((await response.json()) as { id: string }).id;
    }, { apiBaseUrl: DEV_API_BASE_URL });

    await page.goto(`/dashboard/runs/${runId}`);
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
    await page.goto("/dashboard/templates/new");

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

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

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
    await page.goto("/dashboard/templates/new");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", {
      name: /add task to section 1/i,
    }).click();
    await page.getByLabel("Task Title").fill(taskTitle);

    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("button", { name: "Text" }).last().click();

    await expect(
      page.getByPlaceholder("Enter text or markdown content"),
    ).toBeVisible();
    await page
      .getByPlaceholder("Enter text or markdown content")
      .fill(contentValue);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

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
      await page.goto(`/dashboard/templates/${createdTemplateId}`);
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

  test("keeps an uploaded image URL in the block and saves it", async ({ page }) => {
    const stamp = Date.now();
    const templateTitle = `QA Upload ${stamp}`;
    const uploadedUrl = `/api/uploads/file?key=${encodeURIComponent(`template-images/e2e/${stamp}.png`)}`;
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );

    // Stub storage so the test checks the editor, not R2.
    await page.route("**/api/uploads", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ url: uploadedUrl, fileName: "photo.png", fileSize: onePixelPng.length }),
      });
    });

    await registerAccount(page);
    await page.goto("/dashboard/templates/new");
    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /add task to section 1/i }).click();
    await page.getByLabel("Task Title").fill(`Task with image ${stamp}`);
    await page.getByRole("button", { name: "Add Block" }).last().click();
    await page.getByRole("button", { name: "Image", exact: true }).last().click();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });

    await expect(page.getByText("photo.png", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Image URL")).toHaveValue(uploadedUrl);

    await page.getByRole("button", { name: "Remove uploaded image" }).click();
    await expect(page.getByLabel("Image URL")).toHaveValue("");
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await expect(page.getByLabel("Image URL")).toHaveValue(uploadedUrl);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

    const savedTemplate = await findTemplateByTitle(page, templateTitle);
    expect(savedTemplate).toBeTruthy();
    const sections = getTemplateSections(savedTemplate as Record<string, unknown>);
    expect(sections[0]?.items[0]?.contents).toEqual([
      expect.objectContaining({ type: "image", value: uploadedUrl }),
    ]);

    if (savedTemplate && typeof savedTemplate.id === "string") {
      await deleteTemplate(page, savedTemplate.id);
    }
  });

  test("adds tags and categories before save and persists them", async ({ page }) => {
    const templateTitle = `QA Tags ${Date.now()}`;
    const tagName = `tag-${Date.now()}`;
    const categoryName = "camping";
    let createdTemplateId: string | null = null;

    await registerAccount(page);
    await page.goto("/dashboard/templates/new");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByPlaceholder("Add tag...").fill(tagName);
    await page.getByPlaceholder("Add tag...").press("Enter");
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();

    await page.getByText("Select categories...").click();
    await page.getByRole("option", { name: categoryName }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText(categoryName, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

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
    await page.goto("/dashboard/templates/new");

    await page.getByPlaceholder("Enter template name...").fill(templateTitle);
    await page.getByRole("button", { name: /search & seo/i }).click();
    await page.getByPlaceholder("Title for search results...").fill(seoTitle);
    await page.getByPlaceholder("my-template-slug").fill(seoSlug);
    await page
      .getByPlaceholder("Description shown in search results...")
      .fill(seoDescription);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

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
    await page.getByRole("button", { name: /search & seo/i }).click();

    await expect(page.getByPlaceholder("Title for search results...")).toHaveValue(seoTitle);
    await expect(page.getByPlaceholder("my-template-slug")).toHaveValue(seoSlug);
    await expect(
      page.getByPlaceholder("Description shown in search results..."),
    ).toHaveValue(seoDescription);

    await deleteTemplate(page, createdTemplateId);
  });
});
