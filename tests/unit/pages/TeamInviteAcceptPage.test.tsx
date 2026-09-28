import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeamInviteAccept from '@/pages/TeamInviteAccept';

// Opening an invite link must not join the Organization or switch context:
// the page shows who invited you, to which Organization and role, and waits
// for a click.

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
const workspaceMocks = vi.hoisted(() => ({
  refreshTeams: vi.fn(async () => []),
  rememberTeam: vi.fn(),
  selectWorkspace: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  getTeamInvitePreview: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceMocks,
}));

vi.mock('@/lib/api', () => ({
  api: apiMocks,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const preview = {
  status: 'pending' as const,
  teamId: 'team-1',
  teamName: 'Acme Corp',
  teamSlug: 'acme-corp',
  role: 'editor' as const,
  expiresAt: '2026-10-05T00:00:00.000Z',
  inviterName: 'Owner User',
  inviterEmail: 'owner@example.com',
};

function renderInvitePage(seed?: typeof preview | { status: 'already_member' } & Omit<typeof preview, 'status'>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) {
    queryClient.setQueryData(['team-invite-preview', 'invite-token'], seed);
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location="/team-invites/invite-token">
        <Routes>
          <Route path="/team-invites/:token" element={<TeamInviteAccept />} />
        </Routes>
      </StaticRouter>
    </QueryClientProvider>,
  );
}

describe('Organization invite page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = true;
    authState.isLoading = false;
  });

  it('shows the Organization, inviter, and role with Accept and Decline instead of accepting on load', () => {
    const html = renderInvitePage(preview);

    expect(html).toContain('Acme Corp');
    expect(html).toContain('Owner User');
    expect(html).toContain('Editor');
    expect(html).toContain('Accept invite');
    expect(html).toContain('Decline');
    expect(html).not.toContain('Accepting invite');
    expect(html).not.toContain('Invite accepted.');
    expect(apiMocks.acceptTeamInvite).not.toHaveBeenCalled();
    expect(workspaceMocks.selectWorkspace).not.toHaveBeenCalled();
  });

  it('offers to switch context for an existing member without switching it', () => {
    const html = renderInvitePage({ ...preview, status: 'already_member' });

    expect(html).toContain('Switch to Acme Corp');
    expect(html).not.toContain('Accept invite');
    expect(workspaceMocks.selectWorkspace).not.toHaveBeenCalled();
  });

  it('asks signed-out visitors to log in first', () => {
    authState.isAuthenticated = false;

    const html = renderInvitePage();

    expect(html).toContain('Log in to accept');
    expect(apiMocks.getTeamInvitePreview).not.toHaveBeenCalled();
  });

  it('lets a new invitee create an account and come back to the invite', () => {
    authState.isAuthenticated = false;

    const html = renderInvitePage();

    expect(html).toContain('Create an account');
    expect(html).toContain('href="/register?next=%2Fteam-invites%2Finvite-token"');
  });
});
