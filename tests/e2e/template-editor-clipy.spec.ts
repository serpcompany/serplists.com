import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./support/sign-in";

test.describe("template editor regressions", () => {
  test('reviews, edits, previews, and explicitly publishes a generated Clipy draft', async ({ page }) => {
    await loginAsAdmin(page);
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

    await page.goto('/dashboard/templates/new/');
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
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
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
    await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
    expect(createPayload).toMatchObject({
      title: 'Reviewed Clipy Checklist',
      is_public: true,
    });
  });

  test('asks before a generated Clipy draft replaces unsaved work, and locks the form while it generates', async ({ page }) => {
    await loginAsAdmin(page);
    let generateCalls = 0;
    let holdGenerate = false;
    let releaseGenerate: () => void = () => {};
    await page.route('**/api/templates/generate-from-clipy', async (route) => {
      generateCalls += 1;
      if (holdGenerate) {
        await new Promise<void>((resolve) => {
          releaseGenerate = resolve;
        });
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          draft: {
            title: 'Generated Clipy title',
            description: '',
            templateType: 'checklist',
            categories: [],
            tags: [],
            isPublic: false,
            seoTitle: '',
            seoDescription: '',
            seoUrl: '',
            sections: [
              {
                id: 'clipy_replace_steps',
                title: 'Steps',
                items: [{ id: 'clipy_replace_step_1', title: 'Generated step', description: '' }],
              },
            ],
          },
        }),
      });
    });

    await page.goto('/dashboard/templates/new/');
    const title = page.getByPlaceholder('Enter template name...');
    const clipyLink = page.getByLabel('Public Clipy video link');
    await title.fill('My hand-built checklist');
    await clipyLink.fill('https://clipy.online/video/replaceme01');

    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(title).toHaveValue('My hand-built checklist');
    await expect(clipyLink).toHaveValue('https://clipy.online/video/replaceme01');
    expect(generateCalls).toBe(0);

    holdGenerate = true;
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect.poll(() => generateCalls).toBe(1);
    await expect(title).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generating...', exact: true })).toBeDisabled();

    releaseGenerate();
    await expect(title).toHaveValue('Generated Clipy title');
    await expect(title).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Generated step', exact: true })).toBeVisible();
  });

  test("expands every section of a generated Clipy draft", async ({ page }) => {
    await loginAsAdmin(page);
    await page.route("**/api/templates/generate-from-clipy", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "Two part walkthrough",
            description: "",
            templateType: "checklist",
            categories: [],
            tags: [],
            isPublic: false,
            seoTitle: "",
            seoDescription: "",
            seoUrl: "",
            sections: [
              { id: "clipy_two_part_1", title: "Part one", items: [{ id: "clipy_two_part_1_task", title: "First part task", description: "" }] },
              { id: "clipy_two_part_2", title: "Part two", items: [{ id: "clipy_two_part_2_task", title: "Second part task", description: "" }] },
            ],
          },
        }),
      });
    });

    await page.goto("/dashboard/templates/new/");
    await page.getByLabel("Public Clipy video link").fill("https://clipy.online/video/twopart1234");
    await page.getByRole("button", { name: "Generate draft" }).click();

    await expect(page.getByRole("button", { name: "Collapse Part two" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Second part task", exact: true })).toBeVisible();
  });
});
