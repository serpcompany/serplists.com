import { expect, test, type Page } from '@playwright/test';

import { fillSignInForm } from './support/sign-in';

// Every page has one h1, and its headings never skip a level: an h3 right under the h1 hid
// where the page's sections start from anyone who moves through it by headings. Card titles
// take the level of where the card sits (CardTitle's `as`, docs/DESIGN.md). Only headings a
// screen reader reads count: rendered, and not inside aria-hidden.

async function outlineProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((heading) => heading.getClientRects().length > 0 && !heading.closest('[aria-hidden="true"]'))
      .map((heading) => ({ level: Number(heading.tagName[1]), text: (heading.textContent ?? '').trim().slice(0, 60) }));
    const problems: string[] = [];
    const h1Count = headings.filter((heading) => heading.level === 1).length;
    if (h1Count !== 1) problems.push(`${h1Count} h1 headings`);
    let previous = 0;
    for (const heading of headings) {
      if (heading.level > previous + 1) problems.push(`h${heading.level} "${heading.text}" follows an h${previous}`);
      previous = heading.level;
    }
    return problems;
  });
}

// Opens the page, waits for its h1 and for its data, then reads the outline.
async function expectOutline(page: Page, path: string, h1: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  expect(await outlineProblems(page), path).toEqual([]);
}

const PUBLIC_PAGES: Array<[string, string]> = [
  ['/', 'Build the checklist once. Run it every time.'],
  ['/templates/', 'Template Library'],
  ['/categories/', 'Browse Categories'],
  ['/categories/outdoor/', 'outdoor'],
  ['/features/', 'Features that keep work consistent.'],
  ['/features/template-builder/', 'Template Builder'],
  ['/pricing/', 'Simple pricing for checklist workflows.'],
  ['/about/', 'Build repeatable work that feels easy to discover and execute.'],
  ['/contact/', 'Talk to the team behind SERP Lists.'],
  ['/profile/john/', 'John (Free)'],
  ['/profile/serp/ultimate-camping-checklist/', 'Ultimate Camping Checklist'],
  ['/login/', 'Welcome back'],
  ['/register/', 'Create your account'],
  ['/forgot-password/', 'Reset your password'],
  ['/team-invites/no-such-invite/', 'Organization Invite'],
  ['/definitely-missing/', 'That page does not exist'],
];

test('public pages keep one h1 and never skip a heading level', async ({ page }) => {
  test.setTimeout(180_000);
  for (const [path, h1] of PUBLIC_PAGES) {
    await expectOutline(page, path, h1);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Below lg the sign-in pages hide the aside and its h2, so the footer's headings follow the h1.
  test('the sign-in pages keep one h1 and never skip a heading level', async ({ page }) => {
    for (const [path, h1] of [
      ['/login/', 'Welcome back'],
      ['/register/', 'Create your account'],
    ] as const) {
      await expectOutline(page, path, h1);
    }
  });
});

test('console pages keep one h1 and never skip a heading level', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  for (const [path, h1] of [
    ['/dashboard/templates/', 'My Templates'],
    ['/dashboard/templates/template-1/', 'Technical SEO Audit Checklist'],
    ['/dashboard/runs/', 'My Runs'],
    ['/dashboard/import-templates/', 'Import Templates'],
    ['/dashboard/archive/', 'Archive'],
    ['/dashboard/settings/', 'Account Settings'],
    ['/dashboard/definitely-missing/', 'That page does not exist'],
  ] as const) {
    await expectOutline(page, path, h1);
  }
});
