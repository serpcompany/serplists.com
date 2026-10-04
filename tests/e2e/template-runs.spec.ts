import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { organizationRun, organizationTemplate } from './support/organization-records';
import { expectNoSidewaysScroll } from './support/phone';

const ACME_RUNS = '/dashboard/organization/team-1/runs/';

const quietTemplate = { ...organizationTemplate, id: 'tpl-quiet', title: 'Quiet Template' };
const otherTemplate = { ...organizationTemplate, id: 'tpl-other', title: 'Other Template' };

const acmeRuns = [
  { ...organizationRun, id: 'run-open', title: 'Playbook Run Open', started_at: '2026-07-03T00:00:00.000Z' },
  { ...organizationRun, id: 'run-done', title: 'Playbook Run Done', status: 'completed', started_at: '2026-07-02T00:00:00.000Z' },
  { ...organizationRun, id: 'run-other', title: 'Other Run', template_id: otherTemplate.id, status: 'completed' },
];

async function mockAcmeRuns(page: Page) {
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, url, path } = call;
    const inAcme = url.searchParams.get('teamId') === 'team-1';
    if (path === '/api/templates') {
      await fulfillJson(route, inAcme ? [organizationTemplate, quietTemplate, otherTemplate] : []);
    } else if (path === '/api/checklists') {
      await fulfillJson(route, inAcme ? acmeRuns : []);
    } else if (path === `/api/templates/${organizationTemplate.id}`) {
      await fulfillJson(route, organizationTemplate);
    } else {
      await fulfillJson(route, []);
    }
  });
}

const runRows = (page: Page) => page.getByRole('progressbar', { name: 'Run progress' });

async function choose(page: Page, filter: 'Template' | 'Status', option: string) {
  await page.getByRole('combobox', { name: filter }).click();
  await page.getByRole('option', { name: option }).click();
}

test("View runs on an Organization Template opens that Organization's runs of it, which a reload keeps and Status narrows", async ({ page }) => {
  await mockAcmeRuns(page);
  await page.goto(`/dashboard/organization/team-1/templates/${organizationTemplate.id}/`);

  await page.getByRole('link', { name: 'View runs' }).click({ timeout: 30_000 });

  await expect(page).toHaveURL(`${ACME_RUNS}?template=${organizationTemplate.id}`);
  await expect(page.getByRole('combobox', { name: 'Template' })).toContainText(organizationTemplate.title);
  await expect(page.getByRole('link', { name: 'Playbook Run Open' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Playbook Run Done' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Other Run' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Playbook Run Done' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Other Run' })).toHaveCount(0);

  await choose(page, 'Status', 'Completed');
  await expect(page.getByRole('link', { name: 'Playbook Run Open' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Playbook Run Done' })).toBeVisible();

  await choose(page, 'Template', 'All templates');
  await expect(page).toHaveURL(ACME_RUNS);
  await expect(page.getByRole('link', { name: 'Other Run' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Playbook Run Done' })).toBeVisible();
});

test('a Template with no runs says so, and Show all runs clears the filter', async ({ page }) => {
  await mockAcmeRuns(page);
  await page.goto(`${ACME_RUNS}?template=${quietTemplate.id}`);

  await expect(page.getByText('No runs of this template yet')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Runs started from ${quietTemplate.title} appear here.`)).toBeVisible();

  await page.getByRole('button', { name: 'Show all runs' }).click();

  await expect(page).toHaveURL(ACME_RUNS);
  await expect(runRows(page)).toHaveCount(acmeRuns.length);
});

test('choosing a Template on the runs page writes it to the URL, and a search that matches none of its runs says so', async ({ page }) => {
  await mockAcmeRuns(page);
  await page.goto(ACME_RUNS);
  await expect(runRows(page)).toHaveCount(acmeRuns.length, { timeout: 30_000 });

  await choose(page, 'Template', otherTemplate.title);

  await expect(page).toHaveURL(`${ACME_RUNS}?template=${otherTemplate.id}`);
  await expect(runRows(page)).toHaveCount(1);

  await page.getByLabel('Search').fill('no such run');
  await expect(page.getByText('No runs found')).toBeVisible();
  await expect(page.getByText('Try adjusting your search or filters')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the runs page filtered to a Template fits the screen", async ({ page }) => {
    await mockAcmeRuns(page);
    await page.goto(`${ACME_RUNS}?template=${organizationTemplate.id}`);

    await expect(page.getByRole('link', { name: 'Playbook Run Open' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('combobox', { name: 'Template' })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
});
