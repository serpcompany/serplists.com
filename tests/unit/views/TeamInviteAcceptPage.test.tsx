import { navigation } from '../../support/mockedNextNavigation';
import {
  apiMocks,
  inviteeAuth,
  PENDING_INVITE_PREVIEW as preview,
  workspaceMocks,
} from '../../support/teamInvitePage';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { teamInvitePreviewQueryKey } from '@/features/teams/useTeamInviteLink';
import TeamInviteAccept from '@/views/TeamInviteAccept';

function renderInvitePage(
  seed?: typeof preview | { status: 'already_member' } & Omit<typeof preview, 'status'>,
  seededForUserId = 'user-1',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) {
    queryClient.setQueryData(teamInvitePreviewQueryKey('invite-token', seededForUserId), seed);
  }

  navigation.reset('/team-invites/invite-token/', { routes: ['/team-invites/[token]'] });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TeamInviteAccept />
    </QueryClientProvider>,
  );
}

describe('Organization invite page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inviteeAuth.reset();
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

  it('says accepting keeps the current context without claiming which one it is, since the visitor may be in another Organization', () => {
    const html = renderInvitePage(preview);

    expect(html).toContain('Accepting does not change your current context.');
    expect(html).toContain('Switch to the Organization when you want to work in it.');
    expect(html).not.toContain('Personal');
  });

  it('offers to switch context for an existing member without switching it', () => {
    const html = renderInvitePage({ ...preview, status: 'already_member' });

    expect(html).toContain('Switch to Acme Corp');
    expect(html).not.toContain('Accept invite');
    expect(workspaceMocks.selectWorkspace).not.toHaveBeenCalled();
  });

  it("does not show a preview cached for another account after switching accounts", () => {
    const html = renderInvitePage(preview, 'user-previous');

    expect(html).toContain('Loading invite...');
    expect(html).not.toContain('Acme Corp');
    expect(html).not.toContain('Accept invite');
  });

  it('asks signed-out visitors to log in first', () => {
    inviteeAuth.set({ isAuthenticated: false, user: null });

    const html = renderInvitePage();

    expect(html).toContain('Log in to accept');
    expect(apiMocks.getTeamInvitePreview).not.toHaveBeenCalled();
  });

  it('lets a new invitee create an account and come back to the invite', () => {
    inviteeAuth.set({ isAuthenticated: false, user: null });

    const html = renderInvitePage();

    expect(html).toContain('Create an account');
    expect(html).toContain('href="/register/?next=%2Fteam-invites%2Finvite-token%2F"');
  });
});
