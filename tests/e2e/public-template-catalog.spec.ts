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
  await page.goto('/templates/');

  await expect(
    page.getByRole('heading', {
      name: 'Template Library',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();

  await page
    .getByRole('heading', { name: 'Ultimate Camping Checklist' })
    .click();

  await expect(page).toHaveURL(
    /\/profile\/serp\/ultimate-camping-checklist\/$/,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start Run' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Pack the tent setup')).toBeVisible();

  // The breadcrumb's Template Library link goes back to the library.
  const backToTemplatesLink = page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('link', { name: 'Template Library', exact: true });
  await expect(backToTemplatesLink).toHaveAttribute('href', '/templates/');
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
  await page.goto('/profile/serp/');

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
    page.locator('main').getByText('@serp', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Public checklist templates from @serp', {
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

test('library filters follow the URL and clearing the search keeps the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const searchBox = page.getByPlaceholder('Search templates...');
  const campingCard = page.getByRole('heading', {
    name: 'Ultimate Camping Checklist',
  });

  // The header link to a plain /templates resets a search typed on the page.
  await page.goto('/templates/');
  await expect(campingCard).toBeVisible();
  await searchBox.fill('zzzz-no-such-template');
  await expect(page).toHaveURL(/\/templates\/\?search=zzzz-no-such-template$/);
  await expect(campingCard).toHaveCount(0);
  await page
    .locator('header nav')
    .getByRole('link', { name: 'Templates', exact: true })
    .click();
  await expect(page).toHaveURL(/\/templates\/$/);
  await expect(searchBox).toHaveValue('');
  await expect(campingCard).toBeVisible();

  // Back returns to the search, and the box and results follow it.
  await page.goBack();
  await expect(page).toHaveURL(/\/templates\/\?search=zzzz-no-such-template$/);
  await expect(searchBox).toHaveValue('zzzz-no-such-template');
  await expect(campingCard).toHaveCount(0);

  // Clearing the search on a legacy category link leaves the user on the library.
  await page.goto('/templates/?category=outdoor&search=camping');
  await expect(searchBox).toHaveValue('camping');
  await searchBox.fill('');
  await expect(page).toHaveURL(/\/templates\/\?category=outdoor$/);
  await expect(
    page.getByRole('heading', { name: 'Template Library' }),
  ).toBeVisible();
  await expect(searchBox).toBeFocused();
  await expect(campingCard).toBeVisible();

  // A category-only link from elsewhere still goes to the category page. Leave first:
  // opening the URL the tab already shows reloads the library's own entry, marker included.
  await page.goto('/');
  await page.goto('/templates/?category=outdoor');
  await expect(page).toHaveURL(/\/categories\/outdoor\/$/);
});

test('a related category opens with no search or sort from the previous one', async ({
  page,
}) => {
  const searchBox = page.getByPlaceholder('Search templates...');
  const sortTrigger = page.getByRole('combobox');

  await page.goto('/categories/outdoor/');
  await expect(
    page.getByRole('heading', { name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
  await searchBox.fill('zzzz-no-such-template');
  await expect(
    page.getByText('No templates found matching your search.'),
  ).toBeVisible();
  await sortTrigger.click();
  await page.getByRole('option', { name: 'Name A-Z' }).click();
  await expect(sortTrigger).toHaveText('Name A-Z');

  const relatedLink = page
    .locator('section', {
      has: page.getByRole('heading', { name: 'Related Categories' }),
    })
    .getByRole('link')
    .first();
  const relatedPath = await relatedLink.getAttribute('href');
  expect(relatedPath).toMatch(/^\/categories\/[^/]+\/$/);
  await relatedLink.click();

  await expect(page).toHaveURL(new RegExp(`${relatedPath}$`));
  await expect(searchBox).toHaveValue('');
  await expect(sortTrigger).toHaveText('Most Popular');
  await expect(
    page.getByText('No templates found matching your search.'),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start' }).first()).toBeVisible();
});
