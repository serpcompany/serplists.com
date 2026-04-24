import { expect, test } from '@playwright/test';

test('repo-backed starter templates appear as featured content on the homepage', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Build the checklist once. Run it every time.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Start with a real checklist, then make it yours.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Ultimate Camping Checklist')).toBeVisible();
});

test('repo-backed public templates render in the checklist library', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto('/templates');

  await expect(
    page.getByRole('heading', {
      name: 'Discover Templates',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();

  await page
    .getByRole('heading', { name: 'Ultimate Camping Checklist' })
    .click();

  await expect(page).toHaveURL(
    /\/profile\/devinschumacher\/ultimate-camping-checklist$/,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start Run' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Pack the tent setup')).toBeVisible();

  const backToTemplatesLink = page.getByRole('link', {
    name: 'Back',
  });
  const shareButton = page.getByRole('button', { name: 'Share' });
  const ctaPanel = page
    .getByRole('heading', { name: 'Ready to use this template?' })
    .locator('..');
  const actionRail = shareButton.locator('..');

  const backLinkRadius = Number.parseFloat(
    await backToTemplatesLink.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const shareButtonRadius = Number.parseFloat(
    await shareButton.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const ctaPanelRadius = Number.parseFloat(
    await ctaPanel.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const actionRailBox = await actionRail.boundingBox();

  expect(actionRailBox).not.toBeNull();
  expect(actionRailBox?.width ?? 999).toBeLessThan(340);
  expect(backLinkRadius).toBeLessThan(16);
  expect(shareButtonRadius).toBeLessThan(16);
  expect(ctaPanelRadius).toBeLessThan(16);
});

test('public creator profile page stays available under /profile/:username', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto('/profile/devinschumacher');

  const firstTemplateCard = page.getByRole('link', {
    name: /Complete Wedding Planning Checklist/i,
  });
  const firstTemplateChip = firstTemplateCard.getByText('wedding', {
    exact: true,
  }).first();
  const firstTemplateSurface = firstTemplateCard.locator('..');

  await expect(
    page.getByRole('heading', { level: 1, name: 'SERP Lists Library' }),
  ).toBeVisible();
  await expect(
    page.locator('main').getByText('@devinschumacher', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Public checklist templates from @devinschumacher', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Public templates' }),
  ).toBeVisible();
  await expect(page.getByText('Checklist Items')).toBeVisible();
  await expect(firstTemplateCard).toBeVisible();

  const templateCardBox = await firstTemplateCard.boundingBox();
  const templateSurfaceRadius = Number.parseFloat(
    await firstTemplateSurface.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );

  expect(templateCardBox).not.toBeNull();
  expect(templateCardBox?.x ?? 0).toBeGreaterThan(250);
  expect(templateCardBox?.width ?? 0).toBeGreaterThan(360);
  expect(templateCardBox?.width ?? 999).toBeLessThan(460);
  expect(templateCardBox?.height ?? 999).toBeLessThan(280);
  expect(templateSurfaceRadius).toBeLessThan(16);
  await expect(firstTemplateChip).toBeVisible();
});
