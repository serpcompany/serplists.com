import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';
import { deleteRun } from './support/run-saves';

const videoUrl = (name: string) => `https://videos.example.test/${name}.mp4`;

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

async function keepVideoFilesLoadingForever(page: Page) {
  await page.route('https://videos.example.test/**', () => undefined);
}

test('each task plays its own video', async ({ page }) => {
  await keepVideoFilesLoadingForever(page);
  await loginAsAdmin(page);
  const runId = await createRun(page, [videoUrl('a'), videoUrl('b')]);

  try {
    await page.goto(`/dashboard/runs/${runId}/`);
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

test('a video URL the player cannot load becomes a link to it', async ({ page }) => {
  const pageUrl = 'https://videos.example.test/watch/76979871';
  await page.route(pageUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Video page</title>' }));
  await loginAsAdmin(page);
  const runId = await createRun(page, [pageUrl]);

  try {
    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByRole('heading', { level: 2, name: 'Watch video A' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Open video' });
    await expect(link).toHaveAttribute('href', pageUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('video')).toHaveCount(0);
  } finally {
    await deleteRun(page, runId);
  }
});
