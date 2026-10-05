import { expect, test, type Page } from '@playwright/test';

import { loginAsAdmin } from './support/sign-in';

async function outlineProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const isReadByScreenReaders = (heading: Element) =>
      heading.getClientRects().length > 0 && !heading.closest('[aria-hidden="true"]');
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter(isReadByScreenReaders)
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
  ['/profiles/', 'Profiles'],
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

  test('the sign-in pages, which hide their aside and its h2 below lg, keep one h1 and never skip a heading level', async ({ page }) => {
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
  await loginAsAdmin(page);

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
