import { expect, test } from '@playwright/test';

test('repo-backed starter templates appear as featured content on the homepage', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Turn messy repeat work into templates people can actually discover and run.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Start with the official library' }),
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
      name: 'Find the checklist pack that already solved it',
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
  await expect(page.getByText('Action rail')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start checklist' }),
  ).toBeVisible();
  await expect(page.getByText('Pack the tent setup')).toBeVisible();

  const backToTemplatesLink = page.getByRole('link', {
    name: 'Back to templates',
  });
  const templateTypeBadge = page.getByText('Public checklist template', {
    exact: true,
  });
  const categoryChip = page.getByRole('link', { name: 'outdoor' });
  const actionRail = page.getByText('Action rail').locator('..');

  const backLinkRadius = Number.parseFloat(
    await backToTemplatesLink.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const templateTypeBadgeRadius = Number.parseFloat(
    await templateTypeBadge.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const categoryChipRadius = Number.parseFloat(
    await categoryChip.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const actionRailBox = await actionRail.boundingBox();

  expect(actionRailBox).not.toBeNull();
  expect(actionRailBox?.width ?? 999).toBeLessThan(340);
  expect(backLinkRadius).toBeLessThan(16);
  expect(templateTypeBadgeRadius).toBeLessThan(16);
  expect(categoryChipRadius).toBeLessThan(16);
});

test('public creator profile page stays available under /profile/:username', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto('/profile/devinschumacher');

  const profileSidebar = page.getByRole('complementary');
  const firstTemplateCard = page.getByRole('link', {
    name: /Complete Wedding Planning Checklist/i,
  });
  const shareProfileButton = profileSidebar.getByRole('button', {
    name: 'Share profile',
  });
  const firstSidebarChip = profileSidebar.getByRole('link', {
    name: 'wedding',
  });
  const firstTemplateChip = firstTemplateCard.getByText('wedding', {
    exact: true,
  });

  await expect(
    profileSidebar.getByText('@devinschumacher', { exact: true }),
  ).toBeVisible();
  await expect(profileSidebar.getByText('Public profile')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Public templates' }),
  ).toBeVisible();
  await expect(profileSidebar.getByText('Profile stats')).toBeVisible();
  await expect(profileSidebar.getByText('Share profile')).toBeVisible();

  const sidebarBox = await profileSidebar.boundingBox();
  const templateCardBox = await firstTemplateCard.boundingBox();
  const shareButtonRadius = Number.parseFloat(
    await shareProfileButton.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const sidebarChipRadius = Number.parseFloat(
    await firstSidebarChip.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );
  const templateChipRadius = Number.parseFloat(
    await firstTemplateChip.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  );

  expect(sidebarBox).not.toBeNull();
  expect(templateCardBox).not.toBeNull();
  expect(sidebarBox?.x ?? 0).toBeGreaterThan(70);
  expect(sidebarBox?.width ?? 0).toBeGreaterThan(220);
  expect(sidebarBox?.width ?? 999).toBeLessThan(280);
  expect(templateCardBox?.x ?? 0).toBeGreaterThan(260);
  expect(templateCardBox?.width ?? 0).toBeGreaterThan(360);
  expect(templateCardBox?.width ?? 999).toBeLessThan(440);
  expect(templateCardBox?.height ?? 999).toBeLessThan(244);
  expect(shareButtonRadius).toBeLessThan(16);
  expect(sidebarChipRadius).toBeLessThan(16);
  expect(templateChipRadius).toBeLessThan(16);
});
