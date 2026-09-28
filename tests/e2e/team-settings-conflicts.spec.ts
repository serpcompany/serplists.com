import { expect, test, type Page, type Route } from '@playwright/test';

// Organization settings after a write loses a race: the API answers 409 and the page
// must reload what changed instead of keeping stale rows.

type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  user_id: string;
};

type MockState = {
  members: Member[];
  invites: Record<string, unknown>[];
  requests: { method: string; path: string; search: string }[];
  respond: (method: string, path: string) => { status: number; body: unknown } | null;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

const ownerMember: Member = {
  id: 'member-current',
  email: 'owner@example.com',
  name: 'Owner User',
  role: 'owner',
  status: 'active',
  user_id: 'user-owner',
};

const editorMember: Member = {
  id: 'member-editor',
  email: 'editor@example.com',
  name: 'Editor User',
  role: 'editor',
  status: 'active',
  user_id: 'user-editor',
};

async function mockOrganizationApi(page: Page, state: MockState) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    state.requests.push({ method, path, search: url.search });

    if (path === '/api/auth/get-session' && method === 'GET') {
      await fulfillJson(route, {
        session: {
          id: 'session-1',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-07-08T00:00:00.000Z',
          token: 'session-token',
          updatedAt: '2026-07-01T00:00:00.000Z',
          userId: 'user-owner',
        },
        user: {
          id: 'user-owner',
          email: 'owner@example.com',
          emailVerified: true,
          name: 'Owner User',
          username: 'owner',
        },
      });
      return;
    }
    if (path.startsWith('/api/auth/')) {
      await route.continue();
      return;
    }

    const custom = state.respond(method, path);
    if (custom) {
      await fulfillJson(route, custom.body, custom.status);
      return;
    }

    if (path === '/api/teams' && method === 'GET') {
      await fulfillJson(route, [
        { id: 'team-1', memberId: 'member-current', membershipStatus: 'active', name: 'Acme Team', role: 'owner', slug: 'acme-team' },
      ]);
      return;
    }
    if (path === '/api/billing/status' && method === 'GET') {
      await fulfillJson(route, { billingEnabled: true, plan: url.searchParams.get('teamId') ? 'team' : 'free' });
      return;
    }
    if (['/api/teams/invites/pending', '/api/templates', '/api/checklists', '/api/teams/team-1/activity'].includes(path)) {
      await fulfillJson(route, []);
      return;
    }
    if (path === '/api/teams/team-1/members' && method === 'GET') {
      await fulfillJson(route, state.members.map((member) => ({ ...member, avatar_url: null, team_id: 'team-1' })));
      return;
    }
    if (path === '/api/teams/team-1/invites' && method === 'GET') {
      await fulfillJson(route, state.invites);
      return;
    }

    await route.continue();
  });
}

async function openOrganizationSettings(page: Page) {
  await page.goto('/dashboard/settings');
  await page.getByRole('button', { name: 'Switch context' }).click();
  await page.getByRole('menuitem', { name: /Acme Team/i }).click();
  await expect(page.getByText('Your role: Owner')).toBeVisible();
}

function countRequests(state: MockState, method: string, path: string) {
  return state.requests.filter((request) => request.method === method && request.path === path).length;
}

test('a rejected owner transfer reloads the member list', async ({ page }) => {
  const state: MockState = {
    members: [ownerMember, editorMember],
    invites: [],
    requests: [],
    respond: (method, path) => {
      if (method !== 'PUT' || path !== '/api/teams/team-1/owner') return null;
      // Another admin disabled the member while the owner was confirming.
      state.members = [ownerMember, { ...editorMember, status: 'disabled' }];
      return { status: 409, body: { error: 'Ownership could not be transferred', code: 'owner_transfer_conflict' } };
    },
  };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const makeOwner = page.getByRole('button', { name: /make owner/i });
  await expect(makeOwner).toBeVisible();
  const memberLoads = countRequests(state, 'GET', '/api/teams/team-1/members');

  page.once('dialog', (dialog) => void dialog.accept());
  await makeOwner.click();

  await expect(page.getByText('Ownership could not be transferred')).toBeVisible();
  await expect(makeOwner).toHaveCount(0);
  expect(countRequests(state, 'GET', '/api/teams/team-1/members')).toBeGreaterThan(memberLoads);
});

test('changing a member status reloads pending invites so revoked ones disappear', async ({ page }) => {
  const staleInvite = {
    id: 'invite-editor',
    team_id: 'team-1',
    email: 'editor@example.com',
    role: 'admin',
    invited_by_user_id: 'user-owner',
    expires_at: '2099-01-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    inviterEmail: 'owner@example.com',
    inviterName: 'Owner User',
  };
  const state: MockState = {
    members: [ownerMember, { ...editorMember, status: 'disabled' }],
    invites: [staleInvite],
    requests: [],
    respond: (method, path) => {
      if (method !== 'PUT' || path !== '/api/teams/team-1/members/member-editor') return null;
      // The API revokes the member's pending invites when their status changes.
      state.members = [ownerMember, editorMember];
      state.invites = [];
      return { status: 200, body: { success: true } };
    },
  };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const revokeButton = page.getByRole('button', { name: 'Revoke invite for editor@example.com' });
  await expect(revokeButton).toBeVisible();

  await page.getByRole('combobox', { name: 'Member status' }).nth(1).click();
  await page.getByRole('option', { name: 'Active' }).click();

  await expect(page.getByText('Member updated')).toBeVisible();
  await expect(revokeButton).toHaveCount(0);
});
