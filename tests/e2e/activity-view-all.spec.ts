import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { organizationRun, organizationTemplate } from './support/organization-records';

const ALL_ENTRIES = 12;
const subject = { type: 'team', id: 'team-1' };

const eventsUpTo = (limit: number, action: string) =>
  Array.from({ length: Math.min(limit, ALL_ENTRIES) }, (_, index) => ({
    id: `event-${index}`,
    action,
    createdAt: new Date(Date.UTC(2026, 9, 3, 12, 0) - index * 60_000).toISOString(),
    actor: { userId: 'user-owner', email: null, name: 'Owner User', username: 'owner' },
  }));

async function mockHistoryOfTwelve(page: Page) {
  const historyLimits: string[] = [];
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, url, path } = call;
    const limit = Number(url.searchParams.get('limit') ?? 50);
    if (path.endsWith('/history')) historyLimits.push(url.searchParams.get('limit') ?? '');
    if (path === `/api/checklists/${organizationRun.id}`) {
      await fulfillJson(route, organizationRun);
    } else if (path === `/api/checklists/${organizationRun.id}/history`) {
      await fulfillJson(route, { checklistId: organizationRun.id, subject, events: eventsUpTo(limit, 'checklist_run.updated') });
    } else if (path === `/api/templates/${organizationTemplate.id}`) {
      await fulfillJson(route, organizationTemplate);
    } else if (path === `/api/templates/${organizationTemplate.id}/history`) {
      await fulfillJson(route, { templateId: organizationTemplate.id, subject, versions: [], events: eventsUpTo(limit, 'template.updated') });
    } else {
      await fulfillJson(route, []);
    }
  });
  return historyLimits;
}

async function expectEightThenAllTwelve(page: Page, historyLimits: string[]) {
  const entries = page.getByRole('list', { name: 'Activity' }).getByRole('listitem');
  await expect(entries).toHaveCount(8, { timeout: 30_000 });

  await page.getByRole('button', { name: 'View all activity' }).click();

  await expect(entries).toHaveCount(ALL_ENTRIES);
  await expect(page.getByRole('button', { name: 'View all activity' })).toHaveCount(0);
  expect(historyLimits).toEqual(['8', '100']);
}

test("a run's Activity shows its latest 8 entries, and View all activity shows the rest", async ({ page }) => {
  const historyLimits = await mockHistoryOfTwelve(page);
  await page.goto(`/dashboard/organization/team-1/runs/${organizationRun.id}/`);

  await expectEightThenAllTwelve(page, historyLimits);
});

test("a Template's Activity shows its latest 8 entries, and View all activity shows the rest", async ({ page }) => {
  const historyLimits = await mockHistoryOfTwelve(page);
  await page.goto(`/dashboard/organization/team-1/templates/${organizationTemplate.id}/`);

  await expectEightThenAllTwelve(page, historyLimits);
});
