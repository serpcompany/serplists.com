import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson, apiRequest, trackApiRequests } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// The run page keeps one task panel mounted while the task changes. A video block at the
// same position in the next task used to keep the previous task's player, which reads its
// file only once, so it kept playing the previous task's video
// (src/components/shared/VideoEmbed.tsx).

const videoUrl = (name: string) => `https://videos.example.test/${name}.mp4`;

async function loginAsAdmin(page: Page) {
  const apiRequests = trackApiRequests(page, API_BASE_URL);
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  // Signing in lands on Account Settings: let its requests finish before the test calls
  // the API, which the local dev proxy can drop in a burst (see support/api-requests.ts).
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
  await apiRequests.settled();
}

async function createRun(page: Page, videos: string[]) {
  const run = await apiJson<{ id: string }>(page, '/checklists', {
    method: 'POST',
    body: {
      title: `Task videos QA ${Date.now()}`,
      sections: [{ id: 'vid', title: 'Section', items: videos.map((url, index) => ({
        id: `vid-${index}`,
        title: `Watch video ${'AB'[index]}`,
        contents: [{ type: 'video', value: url }],
      })) }],
    },
  });
  return run.id;
}

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

test('each task plays its own video', async ({ page }) => {
  // The files never finish loading (a failed one would show a link instead of the player):
  // only which file each player picked matters.
  await page.route('https://videos.example.test/**', () => undefined);
  await loginAsAdmin(page);
  const runId = await createRun(page, [videoUrl('a'), videoUrl('b')]);

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

// Any http(s) URL that is not YouTube or Clipy goes to the native player, a video page
// (Vimeo, Loom) included. When the player cannot load it, the block links to it instead.
test('a video URL the player cannot load becomes a link to it', async ({ page }) => {
  const pageUrl = 'https://videos.example.test/watch/76979871';
  await page.route(pageUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Video page</title>' }));
  await loginAsAdmin(page);
  const runId = await createRun(page, [pageUrl]);

  try {
    await page.goto(`/dashboard/runs/${runId}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Watch video A' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Open video' });
    await expect(link).toHaveAttribute('href', pageUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('video')).toHaveCount(0);
  } finally {
    await deleteRun(page, runId);
  }
});
