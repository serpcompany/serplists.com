import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { expectNoSidewaysScroll } from './support/phone';

const owner = { userId: 'user-owner', name: 'Owner User', username: 'owner' };
const sections = JSON.stringify([{ id: 'sec-1', title: 'Section', items: [{ id: 'task-a', title: 'Task A' }] }]);

const webRun = {
  id: 'run-web',
  title: 'Website Launch',
  template_id: 'tpl-launch',
  items: sections,
  status: 'in_progress',
  is_public: 0,
  team_id: null,
  user_id: owner.userId,
  revision: 4,
  template_version: 2,
  created_at: '2026-10-01T09:00:00.000Z',
  started_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-02T10:00:00.000Z',
  provenance: { origin: 'web', startedBy: owner },
};

const mcpRun = { ...webRun, id: 'run-mcp', title: 'Agent Audit', provenance: { origin: 'mcp', startedBy: owner } };

const mcpRunDetail = {
  ...mcpRun,
  provenance: {
    owner: { type: 'personal', id: owner.userId, name: owner.name },
    template: { id: 'tpl-launch', title: 'Launch Playbook', version: 2 },
    origin: 'mcp',
    agentKeyName: 'Codex SOP Runner',
    authorizedBy: owner,
    createdBy: owner,
    startedBy: owner,
    assignedTo: null,
    completedBy: null,
  },
};

const launchTemplate = { id: 'tpl-launch', title: 'Launch Playbook', items: sections, is_public: 0, user_id: owner.userId };

async function mockRunsWithProvenance(page: Page) {
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, path } = call;
    if (path === '/api/checklists') await fulfillJson(route, [webRun, mcpRun]);
    else if (path === `/api/checklists/${mcpRun.id}`) await fulfillJson(route, mcpRunDetail);
    else if (path === `/api/checklists/${mcpRun.id}/history`) await fulfillJson(route, { checklistId: mcpRun.id, events: [], subject: { type: 'user', id: owner.userId } });
    else if (path === '/api/templates') await fulfillJson(route, [launchTemplate]);
    else await fulfillJson(route, []);
  });
}

const rowOf = (page: Page, runTitle: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: runTitle }) });

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('My Runs is a table that says who started each run and whether it came from the Web or MCP', async ({ page }) => {
    await mockRunsWithProvenance(page);
    await page.goto('/dashboard/runs/');

    const table = page.getByRole('table', { name: 'Runs' });
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(rowOf(page, 'Website Launch')).toContainText('Owner User');
    await expect(rowOf(page, 'Website Launch')).toContainText('Web');
    await expect(rowOf(page, 'Website Launch').getByRole('link', { name: 'Launch Playbook' })).toBeVisible();
    await expect(rowOf(page, 'Agent Audit')).toContainText('MCP');
    await expect(rowOf(page, 'Agent Audit').getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/dashboard/runs/run-mcp/');
  });

  test("the Run page names an MCP run's Run Key and authorizer, and Show Details lists its provenance", async ({ page }) => {
    await mockRunsWithProvenance(page);
    await page.goto(`/dashboard/runs/${mcpRun.id}/`);

    await expect(page.getByText('Started by Codex SOP Runner via MCP · authorized by Owner User')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Show Details' }).click();

    const details = page.locator('[data-run-provenance] dl');
    await expect(details).toContainText('Run ID');
    await expect(details).toContainText(mcpRun.id);
    await expect(details).toContainText('Run Key');
    await expect(details).toContainText('Codex SOP Runner');
    await expect(details).toContainText('Resource owner');
    await expect(page.getByRole('button', { name: 'Hide Details' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('My Runs keeps its cards, and the Run page details fit the screen', async ({ page }) => {
    await mockRunsWithProvenance(page);
    await page.goto('/dashboard/runs/');

    await expect(page.getByRole('link', { name: 'Agent Audit' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('table', { name: 'Runs' })).toHaveCount(0);
    await expectNoSidewaysScroll(page);

    await page.goto(`/dashboard/runs/${mcpRun.id}/`);
    await page.getByRole('button', { name: 'Show Details' }).click({ timeout: 30_000 });
    await expect(page.locator('[data-run-provenance] dl')).toContainText('Codex SOP Runner');
    await expectNoSidewaysScroll(page);
  });
});
