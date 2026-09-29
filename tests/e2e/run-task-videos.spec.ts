import { expect, test, type Page } from '@playwright/test';

import { trackApiRequests } from './support/api-requests';

// The run page keeps one task panel mounted while the task changes. A video block at the
// same position in the next task used to keep the previous task's player, which reads its
// file only once, so it kept playing the previous task's video
// (src/components/shared/VideoEmbed.tsx).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const videoUrl = (name: string) => `https://videos.example.test/${name}.mp4`;

async function loginAsAdmin(page: Page) {
  const apiRequests = trackApiRequests(page, DEV_API_BASE_URL);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  // Signing in lands on Account Settings: let its requests finish before the test calls
  // the API, which the local dev proxy can drop in a burst (see support/api-requests.ts).
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
  await apiRequests.settled();
}

async function createRun(page: Page) {
  return page.evaluate(async ({ apiBaseUrl, videos }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: `Task videos QA ${Date.now()}`,
        sections: [{ id: 'vid', title: 'Section', items: [
          { id: 'vid-a', title: 'Watch video A', contents: [{ type: 'video', value: videos[0] }] },
          { id: 'vid-b', title: 'Watch video B', contents: [{ type: 'video', value: videos[1] }] },
        ] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL, videos: [videoUrl('a'), videoUrl('b')] });
}

async function deleteRun(page: Page, runId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

test('each task plays its own video', async ({ page }) => {
  // The files never load: only which file each player picked matters.
  await page.route('https://videos.example.test/**', (route) => route.fulfill({ status: 404, body: '' }));
  await loginAsAdmin(page);
  const runId = await createRun(page);

  try {
    await page.goto(`/dashboard/runs/${runId}`);
    const player = page.locator('video');
    const playing = () => player.evaluate((video: HTMLVideoElement) => video.currentSrc);
    await expect(page.getByRole('heading', { level: 2, name: 'Watch video A' })).toBeVisible();
    await expect.poll(playing).toBe(videoUrl('a'));

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Watch video B' })).toBeVisible();
    await expect(player).toHaveCount(1);
    await expect.poll(playing).toBe(videoUrl('b'));

    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Watch video A' })).toBeVisible();
    await expect.poll(playing).toBe(videoUrl('a'));
  } finally {
    await deleteRun(page, runId);
  }
});
