import { expect, test, type Page, type Route } from '@playwright/test';

// The UI offers only the actions the API allows for the member's Organization role
// (src/lib/organizationPermissions.ts mirrors functions/api/utils/team-access.ts).
// The API is mocked so each role sees the same Organization, Template, and run.

type Role = 'viewer' | 'runner';

const sections = [
  { id: 'sec-1', title: 'Section', items: [
    { id: 'task-a', title: 'Task A' },
    { id: 'task-b', title: 'Task B' },
  ] },
];

const organizationTemplate = {
  id: 'tpl-org',
  title: 'Org Playbook',
  description: 'Private Organization template',
  items: JSON.stringify(sections),
  is_public: 0,
  team_id: 'team-1',
  user_id: 'user-owner',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

const organizationRun = {
  id: 'run-org',
  title: 'Org Run',
  template_id: 'tpl-org',
  items: JSON.stringify(sections),
  status: 'in_progress',
  is_stale: true,
  is_public: 0,
  team_id: 'team-1',
  user_id: 'user-owner',
  revision: 1,
  started_at: '2026-07-02T00:00:00.000Z',
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

async function mockOrganizationApi(page: Page, role: Role) {
  const forbidden: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/auth/get-session' && method === 'GET') {
      await fulfillJson(route, {
        session: {
          id: 'session-1',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-07-08T00:00:00.000Z',
          token: 'session-token',
          updatedAt: '2026-07-01T00:00:00.000Z',
          userId: 'user-member',
        },
        user: { id: 'user-member', email: 'member@example.com', emailVerified: true, name: 'Member User', username: 'member' },
      });
      return;
    }
    if (path.startsWith('/api/auth/')) {
      await route.continue();
      return;
    }
    if (method !== 'GET') {
      // Every write a viewer could trigger would be rejected by the real API.
      forbidden.push(`${method} ${path}`);
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

    await route.continue();
  });

  return { forbidden };
}

test('an Organization viewer sees no actions the API would reject', async ({ page }) => {
  const api = await mockOrganizationApi(page, 'viewer');

  await page.goto('/dashboard/templates');
  await expect(page.getByText('Org Playbook')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Template' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New Template' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Run' })).toHaveCount(0);

  await page.goto('/dashboard/templates/tpl-org');
  await expect(page.getByRole('heading', { name: 'Org Playbook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Run' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Copy to My Templates|Upgrade to copy/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  await page.goto('/dashboard/runs');
  await expect(page.getByText('Org Run')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revalidate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run options' })).toHaveCount(0);

  await page.goto('/dashboard/runs/run-org');
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await expect(page.getByText('View only').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save notes' })).toHaveCount(0);

  expect(api.forbidden).toEqual([]);
});

test('an Organization runner can run but not edit or delete', async ({ page }) => {
  await mockOrganizationApi(page, 'runner');

  await page.goto('/dashboard/templates/tpl-org');
  await expect(page.getByRole('heading', { name: 'Org Playbook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  await page.goto('/dashboard/runs');
  await page.getByRole('button', { name: 'Run options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Share Run' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);

  await page.goto('/dashboard/runs/run-org');
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeVisible();
  await expect(page.getByText('View only')).toHaveCount(0);
});
