import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { apiJson, bodyNotRead } from './support/api-requests';
import { apiTemplateRows, savedTemplateSchema } from './support/api-bodies';
import { loginAsAdmin } from './support/sign-in';

const isTemplatesEndpoint = (url: URL) => url.pathname.endsWith('/api/templates');

test('a slow Duplicate cannot be chosen again and makes one copy', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Duplicate in flight ${Date.now()}`;
  const created = await apiJson(page, '/templates', savedTemplateSchema, {
    method: 'POST',
    body: {
      title,
      sections: [{ id: 'duplicate-section', title: 'Section', items: [{ id: 'duplicate-item', title: 'Task' }] }],
    },
  });
  const copyIds: string[] = [];

  let releaseCopy: () => void = () => {};
  const copyHeld = new Promise<void>((resolve) => {
    releaseCopy = resolve;
  });
  let copyRequests = 0;
  await page.route(
    isTemplatesEndpoint,
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      copyRequests += 1;
      await copyHeld;
      await route.continue();
    },
  );

  try {
    await page.goto(`/dashboard/templates/${created.id}/`);
    await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Template actions' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect.poll(() => copyRequests).toBe(1);

    await page.getByRole('button', { name: 'Template actions' }).click();
    const running = page.getByRole('menuitem', { name: 'Duplicating...' });
    await expect(running).toBeVisible();
    await expect(running).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    const copied = page.waitForResponse(
      (response) => response.url().endsWith('/api/templates') && response.request().method() === 'POST',
    );
    releaseCopy();
    const copy = z.object({ id: z.string() }).passthrough().parse(await (await copied).json());
    copyIds.push(copy.id);
    await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${copy.id}/$`));
    expect(copyRequests).toBe(1);

    const own = await apiJson(page, '/templates?scope=personal', apiTemplateRows);
    expect(own.filter((row) => row.title === `${title} Copy`)).toHaveLength(1);
  } finally {
    releaseCopy();
    await page.unroute(isTemplatesEndpoint);
    for (const id of [created.id, ...copyIds]) {
      await apiJson(page, `/templates/${id}`, bodyNotRead, { method: 'DELETE' });
    }
  }
});
