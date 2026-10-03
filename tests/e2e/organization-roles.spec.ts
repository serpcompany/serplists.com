import { expect, test, type Page } from '@playwright/test';
import { fulfillJson, routeTheApi, sessionOf } from './support/mocked-api';
import { organizationRun, organizationTemplate } from './support/organization-records';

type Role = 'viewer' | 'runner' | 'editor';

const archivedTemplate = { ...organizationTemplate, id: 'tpl-archived', title: 'Archived Playbook', deleted_at: '2026-07-03T00:00:00.000Z' };
const archivedRun = { ...organizationRun, id: 'run-archived', title: 'Archived Run', deleted_at: '2026-07-03T00:00:00.000Z' };

async function mockOrganizationApi(page: Page, role: Role) {
  const rejectedWrites: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1');
  });

  await routeTheApi(page, async ({ route, url, path, method }) => {
    if (path === '/api/auth/get-session' && method === 'GET') {
      await fulfillJson(route, sessionOf({ id: 'user-member', email: 'member@example.com', name: 'Member User', username: 'member' }));
      return;
    }
    if (path.startsWith('/api/auth/')) {
      await route.continue();
      return;
    }
    if (method !== 'GET') {
      rejectedWrites.push(`${method} ${path}`);
      await fulfillJson(route, { error: 'Forbidden' }, 403);
      return;
    }
    if (path === '/api/teams') {
      await fulfillJson(route, [
        { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme', role, slug: 'acme' },
      ]);
      return;
    }
    if (path === '/api/teams/invites/pending') return fulfillJson(route, []);
    if (path === '/api/billing/status') return fulfillJson(route, { billingEnabled: false, plan: 'team' });
    if (path === '/api/templates') {
      await fulfillJson(route, url.searchParams.get('teamId') === 'team-1' ? [organizationTemplate] : []);
      return;
    }
    if (path === '/api/templates/tpl-org') return fulfillJson(route, organizationTemplate);
    if (path === '/api/templates/tpl-org/history') {
      return fulfillJson(route, { events: [], subject: { type: 'team', id: 'team-1' }, templateId: 'tpl-org', versions: [] });
    }
    if (path === '/api/checklists') return fulfillJson(route, [organizationRun]);
    if (path === '/api/checklists/run-org') return fulfillJson(route, organizationRun);
    if (path === '/api/checklists/run-org/history') {
      return fulfillJson(route, { checklistId: 'run-org', events: [], subject: { type: 'team', id: 'team-1' } });
    }
    if (path === '/api/templates/archived') return fulfillJson(route, [archivedTemplate]);
    if (path === '/api/checklists/archived') return fulfillJson(route, [archivedRun]);

    await route.continue();
  });

  return { rejectedWrites };
}

async function expectNoTemplateFormAndNoWrites(page: Page, api: { rejectedWrites: string[] }) {
  await expect(page.getByPlaceholder('Enter template name...')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(api.rejectedWrites).toEqual([]);
}

test('an Organization viewer sees no actions the API would reject', async ({ page }) => {
  const api = await mockOrganizationApi(page, 'viewer');

  await page.goto('/dashboard/templates/');
  await expect(page.getByText('Org Playbook')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Template' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New Template' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Run' })).toHaveCount(0);

  await page.goto('/dashboard/templates/tpl-org/');
  await expect(page.getByRole('heading', { name: 'Org Playbook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Run' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Copy to My Templates|Upgrade to copy/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  await page.goto('/dashboard/runs/');
  await expect(page.getByText('Org Run')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revalidate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run options' })).toHaveCount(0);

  await page.goto('/dashboard/runs/run-org/');
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await expect(page.getByText('View only').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save notes' })).toHaveCount(0);

  await page.goto('/dashboard/archive/');
  await expect(page.getByText('Archived Playbook', { exact: true })).toBeVisible();
  await expect(page.getByText('Archived Run', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);

  expect(api.rejectedWrites).toEqual([]);
});

test('an Organization runner can run but not edit or delete', async ({ page }) => {
  await mockOrganizationApi(page, 'runner');

  await page.goto('/dashboard/templates/tpl-org/');
  await expect(page.getByRole('heading', { name: 'Org Playbook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  await page.goto('/dashboard/runs/');
  await page.getByRole('button', { name: 'Run options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Share Run' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);

  await page.goto('/dashboard/runs/run-org/');
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeVisible();
  await expect(page.getByText('View only')).toHaveCount(0);
});

test('an Organization viewer opening an edit link gets a read-only notice, not the editor', async ({ page }) => {
  const api = await mockOrganizationApi(page, 'viewer');

  await page.goto('/dashboard/templates/tpl-org/edit/');

  await expect(page.getByText("You can't edit this template")).toBeVisible();
  await expect(page.getByRole('link', { name: 'View template' })).toHaveAttribute(
    'href',
    '/dashboard/organization/team-1/templates/tpl-org/',
  );
  await expectNoTemplateFormAndNoWrites(page, api);
});

test('an Organization runner opening New Template gets a read-only notice', async ({ page }) => {
  const api = await mockOrganizationApi(page, 'runner');

  await page.goto('/dashboard/templates/new/');

  await expect(page.getByText("You can't create templates here")).toBeVisible();
  await expectNoTemplateFormAndNoWrites(page, api);
});

test('an Organization editor can restore archived Templates but not runs', async ({ page }) => {
  await mockOrganizationApi(page, 'editor');

  await page.goto('/dashboard/archive/');
  await expect(page.getByText('Archived Run', { exact: true })).toBeVisible();
  const templateRow = page.getByRole('listitem').filter({ hasText: 'Archived Playbook' });
  await expect(templateRow.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(1);
});
