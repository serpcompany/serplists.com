import { expect, test, type Page } from '@playwright/test';
import { updatedTeamSchema } from './support/api-bodies';
import { fulfillJson, OWNER_SESSION, routeTheApi } from './support/mocked-api';

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

const savedOrganization = updatedTeamSchema.parse({
  success: true,
  team: {
    id: 'team-1',
    name: 'Acme Ops',
    slug: 'acme-team',
    billing_owner_user_id: 'user-owner',
    created_by_user_id: 'user-owner',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    archived_at: null,
    membership: { id: 'member-current', role: 'owner', status: 'active' },
  },
});

async function mockOrganizationApi(page: Page, state: MockState) {
  await routeTheApi(page, async ({ route, url, path, method }) => {
    state.requests.push({ method, path, search: url.search });

    if (path === '/api/auth/get-session' && method === 'GET') {
      await fulfillJson(route, OWNER_SESSION);
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
  await page.goto('/dashboard/settings/');
  await page.getByRole('button', { name: 'Switch context' }).click();
  await page.getByRole('menuitem', { name: /Acme Team/i }).click();
  await expect(page.getByText('Your role: Owner')).toBeVisible();
}

async function openAccountSettings(page: Page) {
  await page.goto('/dashboard/settings/');
  await expect(page.getByRole('heading', { level: 1, name: 'Account Settings' })).toBeVisible();
}

function countRequests(state: MockState, method: string, path: string) {
  return state.requests.filter((request) => request.method === method && request.path === path).length;
}

test('an owner transfer refused because another admin disabled the member meanwhile reloads the member list', async ({ page }) => {
  const state: MockState = {
    members: [ownerMember, editorMember],
    invites: [],
    requests: [],
    respond: (method, path) => {
      if (method !== 'PUT' || path !== '/api/teams/team-1/owner') return null;
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
      state.members = [ownerMember, editorMember];
      state.invites = [];
      return { status: 200, body: { success: true } };
    },
  };
  await mockOrganizationApi(page, state);
  await openOrganizationSettings(page);

  const revokeButton = page.getByRole('button', { name: 'Revoke invite for editor@example.com' });
  await expect(revokeButton).toBeVisible();

  await page.getByRole('combobox', { name: 'Status for Editor User (editor@example.com)' }).click();
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
      ? { status: 200, body: savedOrganization }
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
  await openAccountSettings(page);

  await page.locator('#team-name').fill('Acme');
  await page.locator('#team-slug').fill('acme-team');
  await page.getByRole('button', { name: 'Create Organization' }).click();

  await expect(page.getByText('Organization slug is already in use')).toBeVisible();
  await expect(page.getByText('Organization created')).toHaveCount(0);
  await expect(page.locator('#team-slug')).toHaveValue('acme-team');
});

test('accepting an invite to an Organization the user already belongs to shows the conflict and drops it', async ({ page }) => {
  let incoming: Record<string, unknown>[] = [{
    id: 'invite-stale',
    teamId: 'team-1',
    teamName: 'Acme Team',
    email: 'owner@example.com',
    role: 'admin',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    inviterEmail: 'admin@example.com',
    inviterName: 'Admin User',
  }];
  const state: MockState = {
    members: [ownerMember],
    invites: [],
    requests: [],
    respond: (method, path) => {
      if (method === 'GET' && path === '/api/teams/invites/pending') return { status: 200, body: incoming };
      if (method !== 'POST' || path !== '/api/teams/invites/pending/invite-stale/accept') return null;
      incoming = [];
      return {
        status: 409,
        body: { error: 'You are already a member of this Organization', code: 'team_member_exists' },
      };
    },
  };
  await mockOrganizationApi(page, state);
  await openAccountSettings(page);

  await page.getByRole('button', { name: 'Accept invite to Acme Team' }).click();

  await expect(page.getByText('You are already a member of this Organization')).toBeVisible();
  await expect(page.getByText('Organization invite accepted')).toHaveCount(0);
  await expect(page.getByText('Incoming invites')).toHaveCount(0);
});
