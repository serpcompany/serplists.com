import { expect, test, type Locator, type Page } from '@playwright/test';

import { createdRunSchema } from './support/api-bodies';
import { apiJson, apiRequest, bodyNotRead } from './support/api-requests';
import { expectNoSidewaysScroll } from './support/phone';
import { loginAsAdmin } from './support/sign-in';
import { createOneTaskTemplate, deleteTemplate } from './support/template-editor';

const TIME_TRACKER = { name: 'Time tracker', url: 'https://example.com/track' };
const SLIDESHOW_APP = { name: 'Slideshow app', url: 'https://example.com/slides' };

const requiredTools = (page: Page): Locator => page.getByRole('region', { name: 'Required tools' });

async function fillTool(page: Page, number: number, tool: { name: string; url: string }) {
  await page.getByRole('button', { name: 'Add tool' }).click();
  await page.getByLabel(`Tool ${number} Name`).fill(tool.name);
  await page.getByLabel(`Tool ${number} URL`).fill(tool.url);
}

async function saveTheEditedTemplate(page: Page, templateId: string) {
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/api/templates/${templateId}`),
  );
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await saved).ok()).toBe(true);
}

async function expectTheToolsListed(page: Page) {
  const tools = requiredTools(page);
  const link = tools.getByRole('link', { name: `${TIME_TRACKER.name} (opens in a new tab)` });
  await expect(link).toHaveAttribute('href', TIME_TRACKER.url, { timeout: 30_000 });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(tools.getByRole('listitem').filter({ hasText: SLIDESHOW_APP.name })).toContainText('Optional');
  await expect(tools.getByRole('listitem').filter({ hasText: TIME_TRACKER.name })).toContainText('Required');
}

test('the owner lists Required tools in the editor, and Template detail, the public Template page and the Run page link them', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createOneTaskTemplate(page, `Required tools ${Date.now()}`, true);

  await page.goto(`/dashboard/templates/${templateId}/edit/`);
  await fillTool(page, 1, TIME_TRACKER);
  await fillTool(page, 2, SLIDESHOW_APP);
  await page.getByRole('switch', { name: 'Tool 2 Required' }).click();
  await saveTheEditedTemplate(page, templateId);

  await page.goto(`/dashboard/templates/${templateId}/`);
  await expectTheToolsListed(page);

  await page.getByRole('link', { name: 'View public template' }).click();
  await expect(page).toHaveURL(/\/profile\/admin\//);
  await expectTheToolsListed(page);

  const run = await apiJson(page, '/checklists', createdRunSchema, {
    method: 'POST',
    body: { template_id: templateId, title: 'Required tools run' },
  });
  await page.goto(`/dashboard/runs/${run.id}/`);
  await expectTheToolsListed(page);

  await apiRequest(page, `/checklists/${run.id}`, bodyNotRead, { method: 'DELETE' });
  await deleteTemplate(page, templateId);
});

test('on a phone the Required tools fields fit the screen, and a save names the tool whose URL is not a web address', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  const templateId = await createOneTaskTemplate(page, `Required tools phone ${Date.now()}`, false);

  await page.goto(`/dashboard/templates/${templateId}/edit/`);
  await fillTool(page, 1, { name: TIME_TRACKER.name, url: 'example.com/track' });
  await expectNoSidewaysScroll(page);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText("Required tools: tool 1's URL must start with http:// or https:// and have no spaces.")).toBeVisible();
  await page.getByLabel('Tool 1 URL').fill(TIME_TRACKER.url);
  await saveTheEditedTemplate(page, templateId);

  await page.goto(`/dashboard/templates/${templateId}/`);
  await expect(requiredTools(page).getByRole('link', { name: `${TIME_TRACKER.name} (opens in a new tab)` })).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page);

  await deleteTemplate(page, templateId);
});
