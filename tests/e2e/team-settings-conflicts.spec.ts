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

test('revoking an invite that was just accepted reports the conflict and shows the new member', async ({ page }) => {
  const acceptedInvite = {
    id: 'invite-new',
    team_id: 'team-1',
    email: 'new@example.com',
    role: 'viewer',
    invited_by_user_id: 'user-owner',
    expires_at: '2099-01-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    inviterEmail: 'owner@example.com',
    inviterName: 'Owner User',
  };
  const newMember: Member = {
    id: 'member-new',
    email: 'new@example.com',
    name: 'New Member',
    role: 'viewer',
    status: 'active',
    user_id: 'user-new',
  };
  const state: MockState = {
    members: [ownerMember],
    invites: [acceptedInvite],
    requests: [],
    respond: (method, path) => {
      if (method !== 'DELETE' || path !== '/api/teams/team-1/invites/invite-new') return null;
      // The invitee accepted while the admin was clicking Revoke.
      state.members = [ownerMember, newMember];
      state.invites = [];
      return { status: 409, body: { error: 'Invite was already accepted', code: 'invite_already_accepted' } };
    },
  };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const revokeButton = page.getByRole('button', { name: 'Revoke invite for new@example.com' });
  await revokeButton.click();

  await expect(page.getByText('Invite was already accepted')).toBeVisible();
  await expect(page.getByText('Invite revoked')).toHaveCount(0);
  await expect(revokeButton).toHaveCount(0);
  await expect(page.getByText('New Member')).toBeVisible();
});

test('Organization activity requests only the events the page shows', async ({ page }) => {
  const state: MockState = { members: [ownerMember], invites: [], requests: [], respond: () => null };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const activitySearches = () => state.requests
    .filter(({ method, path }) => method === 'GET' && path === '/api/teams/team-1/activity')
    .map(({ search }) => search);
  await expect.poll(activitySearches).toContain('?limit=10');
});

test('Save Organization stays disabled until a field changes and sends only what changed', async ({ page }) => {
  const state: MockState = {
    members: [ownerMember],
    invites: [],
    requests: [],
    respond: (method, path) => (method === 'PUT' && path === '/api/teams/team-1'
      ? { status: 200, body: { success: true, team: { id: 'team-1', name: 'Acme Ops', slug: 'acme-team' } } }
      : null),
  };
  const updateBodies: unknown[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/teams/team-1') {
      updateBodies.push(request.postDataJSON());
    }
  });
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const save = page.getByRole('button', { name: 'Save Organization' });
  const name = page.locator('#team-settings-name');
  await expect(name).toHaveValue('Acme Team');
  await expect(save).toBeDisabled();

  await name.fill('  Acme Team ');
  await expect(save).toBeDisabled();

  await name.fill('Acme Ops');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByText('Organization updated')).toBeVisible();
  await expect(page.getByText('No fields to update')).toHaveCount(0);
  expect(updateBodies).toEqual([{ name: 'Acme Ops' }]);
});

test('creating an Organization with a taken slug shows the conflict and keeps the form', async ({ page }) => {
  const state: MockState = {
    members: [ownerMember],
    invites: [],
    requests: [],
    respond: (method, path) => (method === 'POST' && path === '/api/teams'
      ? { status: 409, body: { error: 'Organization slug is already in use', code: 'team_slug_exists' } }
      : null),
  };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  await page.locator('#team-name').fill('Acme');
  await page.locator('#team-slug').fill('acme-team');
  await page.getByRole('button', { name: 'Create Organization' }).click();

  await expect(page.getByText('Organization slug is already in use')).toBeVisible();
  await expect(page.getByText('Organization created')).toHaveCount(0);
  await expect(page.locator('#team-slug')).toHaveValue('acme-team');
});
