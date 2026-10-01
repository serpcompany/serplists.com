import { expect, test, type Page, type Route } from '@playwright/test';

type InviteRequest = {
  email: string;
  role?: string;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function mockTeamWorkspaceApi(page: Page, options: { failTeamsAfterTransfer?: boolean } = {}) {
  const inviteRequests: InviteRequest[] = [];
  let createdInvite: Record<string, unknown> | null = null;
  let ownershipTransferred = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/get-session' && request.method() === 'GET') {
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

    if (path === '/api/teams/team-1/owner' && request.method() === 'PUT') {
      ownershipTransferred = true;
      await fulfillJson(route, { success: true, ownerMemberId: 'member-editor', ownerUserId: 'user-editor' });
      return;
    }

    if (path === '/api/teams' && request.method() === 'GET') {
      if (ownershipTransferred && options.failTeamsAfterTransfer) {
        await fulfillJson(route, { error: 'Service unavailable' }, 503);
        return;
      }
      await fulfillJson(route, [
        {
          id: 'team-1',
          memberId: 'member-current',
          membershipStatus: 'active',
          name: 'Acme Team',
          role: 'owner',
          slug: 'acme-team',
        },
      ]);
      return;
    }

    if (path === '/api/teams/invites/pending' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/api/billing/status' && request.method() === 'GET') {
      await fulfillJson(route, {
        billingEnabled: true,
        plan: url.searchParams.get('teamId') ? 'team' : 'free',
      });
      return;
    }

    if (path === '/api/templates' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/api/checklists' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/api/teams/team-1/members' && request.method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'member-current',
          avatar_url: null,
          email: 'owner@example.com',
          name: 'Owner User',
          role: ownershipTransferred ? 'admin' : 'owner',
          status: 'active',
          team_id: 'team-1',
          user_id: 'user-owner',
        },
        {
          id: 'member-editor',
          avatar_url: null,
          email: 'editor@example.com',
          name: 'Editor User',
          role: ownershipTransferred ? 'owner' : 'editor',
          status: 'active',
          team_id: 'team-1',
          user_id: 'user-editor',
        },
      ]);
      return;
    }

    if (path === '/api/teams/team-1/invites' && request.method() === 'GET') {
      await fulfillJson(route, createdInvite ? [createdInvite] : []);
      return;
    }

    if (path === '/api/teams/team-1/invites' && request.method() === 'POST') {
      const payload = request.postDataJSON() as InviteRequest;
      const invitePath = '/team-invites/e2e-token/';
      const inviteUrl = new URL(invitePath, page.url()).toString();
      inviteRequests.push(payload);
      createdInvite = {
        id: 'invite-1',
        created_at: '2026-07-01T00:00:00.000Z',
        delivery: {
          mode: 'link',
          status: 'ready',
          invitePath,
          inviteUrl,
        },
        email: payload.email.toLowerCase(),
        expiresAt: '2026-07-08T00:00:00.000Z',
        expires_at: '2026-07-08T00:00:00.000Z',
        invitePath,
        inviteToken: 'e2e-token',
        inviteUrl,
        invited_by_user_id: 'user-owner',
        inviterEmail: 'owner@example.com',
        inviterName: 'Owner User',
        role: payload.role ?? 'viewer',
        team_id: 'team-1',
      };
      await fulfillJson(route, createdInvite);
      return;
    }

    if (path === '/api/teams/team-1/activity' && request.method() === 'GET') {
      await fulfillJson(route, createdInvite
        ? [
            {
              id: 'event-1',
              action: 'team_invite.created',
              actor: {
                email: 'owner@example.com',
                name: 'Owner User',
                userId: 'user-owner',
              },
              createdAt: '2026-07-01T00:00:00.000Z',
              resource: {
                id: 'invite-1',
                type: 'team_invite',
              },
            },
          ]
        : []);
      return;
    }

    await route.continue();
  });

  return {
    inviteRequests,
  };
}

test('@smoke team workspace settings create link invites and expose owner controls', async ({
  page,
}) => {
  const apiMock = await mockTeamWorkspaceApi(page);

  await page.goto('/dashboard/settings/');

  await page.getByRole('button', { name: 'Switch context' }).click();
  await page.getByRole('menuitem', { name: /Acme Team/i }).click();

  await expect(
    page.getByRole('heading', { name: 'Account Settings' }),
  ).toBeVisible();
  await expect(page.getByText('Your role: Owner')).toBeVisible();
  await expect(
    page.getByText('Owns billing, members, settings, templates, and runs.'),
  ).toBeVisible();
  await expect(
    page.getByText('Paid Organization entitlements apply while this Organization is selected.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /make owner/i })).toBeVisible();

  await page.getByLabel('Invite email').fill('New@Example.com');
  await page.getByRole('button', { name: /create link/i }).click();

  await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveValue(
    /\/team-invites\/e2e-token\/$/,
  );
  await expect(page.getByText('Invite link for new@example.com')).toBeVisible();
  const pendingInviteRow = page.getByText('new@example.com', { exact: true });
  await expect(pendingInviteRow).toBeVisible();
  expect(apiMock.inviteRequests).toEqual([
    {
      email: 'New@Example.com',
      role: 'viewer',
    },
  ]);
});

test('an ownership transfer that saved is not reported as failed when the Organization list cannot refresh', async ({
  page,
}) => {
  await mockTeamWorkspaceApi(page, { failTeamsAfterTransfer: true });

  await page.goto('/dashboard/settings/');
  await page.getByRole('button', { name: 'Switch context' }).click();
  await page.getByRole('menuitem', { name: /Acme Team/i }).click();
  await expect(page.getByText('Your role: Owner')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /make owner/i }).click();

  await expect(page.getByText('Organization ownership transferred')).toBeVisible();
  await expect(page.getByText('Saved, but refreshing failed. Reload to see the latest state.')).toBeVisible();
  await expect(page.getByText('Failed to transfer ownership')).toHaveCount(0);
  await expect(page.getByText('Service unavailable')).toHaveCount(0);
  await expect(page.getByText('Your role: Admin')).toBeVisible();
  await expect(page.getByRole('button', { name: /make owner/i })).toHaveCount(0);
});
