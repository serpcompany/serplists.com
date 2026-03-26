import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL = process.env.VITE_API_URL ?? 'http://localhost:8788/api';

async function signInAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /fill admin/i }).click();
  await page.getByRole('button', { name: /sign in with email/i }).click();
  await expect(page).toHaveURL(/\/account/);
}

test.describe('route structure', () => {
  test('canonical feature, library, and category detail routes render', async ({
    page,
  }) => {
    await page.goto('/checklists');
    await expect(
      page.getByRole('heading', {
        name: 'Find the checklist pack that already solved it',
      }),
    ).toBeVisible();

    await page.goto('/features/template-builder');
    await expect(
      page.getByRole('heading', { name: 'Template Builder' }),
    ).toBeVisible();

    await page.goto('/categories/outdoor');
    await expect(
      page.getByRole('heading', { name: 'outdoor checklist packs' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ultimate Camping Checklist' }),
    ).toBeVisible();
  });

  test('legacy public routes redirect to the live canonical library path', async ({
    page,
  }) => {
    await page.goto('/checklists');
    await expect(page).toHaveURL(/\/checklists$/);

    await page.goto('/templates');
    await expect(page).toHaveURL(/\/checklists$/);
  });

  test('legacy console routes redirect to the live canonical dashboard path', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto('/console');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('removed mixed-surface routes still return not found', async ({ page }) => {
    await page.goto('/templates/new');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();
  });

  test('shared checklist pages use /share and render noindex,nofollow', async ({
    page,
  }) => {
    await signInAsAdmin(page);

    const shareToken = await page.evaluate(async (apiBase) => {
      const createRunResponse = await fetch(`${apiBase}/checklists`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Share Route Verification',
          items: [{ id: 'item-1', title: 'Confirm canonical share route' }],
          status: 'in_progress',
        }),
      });

      if (!createRunResponse.ok) {
        throw new Error(`Unable to create run: ${createRunResponse.status}`);
      }

      const createdRun = (await createRunResponse.json()) as { id?: string };

      if (!createdRun.id) {
        throw new Error('Run id missing from API response');
      }

      const response = await fetch(
        `${apiBase}/checklists/run/${createdRun.id}/share`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Unable to create share token: ${response.status}`);
      }

      const data = (await response.json()) as { shareToken?: string };

      if (!data.shareToken) {
        throw new Error('Share token missing from API response');
      }

      return data.shareToken;
    }, API_BASE_URL);

    await page.goto(`/share/${shareToken}`);

    await expect(page).toHaveURL(new RegExp(`/share/${shareToken}$`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });
});
