import { expect, test, type Locator, type Page } from '@playwright/test';
import { statSync } from 'node:fs';
import { z } from 'zod';

import { AVATAR_MAX_PIXELS } from '../../src/lib/imageOptimization';
import { registerNewAccount, uniqueSuffix } from './support/sign-in';

const PHOTO = 'public/og-default.png';
const storedUpload = z.object({ contentType: z.string(), fileName: z.string(), fileSize: z.number() });

const settingsAvatar = (page: Page) =>
  page
    .getByRole('button', { name: 'Upload avatar' })
    .locator('xpath=ancestor::div[.//*[@data-slot="avatar"]][1]')
    .locator('[data-slot="avatar"]');
const accountMenuAvatar = (page: Page) => page.getByRole('button', { name: 'Account menu' }).locator('[data-slot="avatar"]');

async function loadedImageSize(avatar: Locator) {
  const image = avatar.locator('img');
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBeTruthy();
  return image.evaluate((element: HTMLImageElement) => ({ width: element.naturalWidth, height: element.naturalHeight }));
}

async function expectTheUploadedAvatarEverywhere(page: Page) {
  expect(await loadedImageSize(settingsAvatar(page))).toEqual({ width: AVATAR_MAX_PIXELS, height: AVATAR_MAX_PIXELS });
  expect(await loadedImageSize(accountMenuAvatar(page))).toEqual({ width: AVATAR_MAX_PIXELS, height: AVATAR_MAX_PIXELS });
}

test('@smoke an uploaded avatar is shrunk to a small square, shows in Settings and the account menu, and stays after a reload', async ({ page }) => {
  await registerNewAccount(page, {
    name: 'Avatar Tester',
    email: `avatar-${uniqueSuffix()}@example.test`,
    password: 'avatar-password-1',
  });
  await page.goto('/dashboard/settings/');
  await expect(page.getByRole('button', { name: 'Upload avatar' })).toBeVisible({ timeout: 15_000 });

  const upload = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/uploads');
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload avatar' }).click();
  await (await fileChooser).setFiles(PHOTO);
  const stored = storedUpload.parse(await (await upload).json());
  expect(stored).toMatchObject({ contentType: 'image/webp', fileName: 'avatar.webp' });
  expect(stored.fileSize).toBeLessThan(statSync(PHOTO).size);
  await expect(page.getByText('Avatar updated successfully!')).toBeVisible({ timeout: 15_000 });

  await expectTheUploadedAvatarEverywhere(page);

  await page.reload();
  await expectTheUploadedAvatarEverywhere(page);

  await page.getByRole('button', { name: 'Remove avatar' }).click();
  await expect(page.getByText('Avatar removed successfully!')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Upload avatar' })).toBeVisible({ timeout: 15_000 });
  await expect(settingsAvatar(page).locator('img')).toHaveCount(0);
  await expect(accountMenuAvatar(page).locator('img')).toHaveCount(0);
});
