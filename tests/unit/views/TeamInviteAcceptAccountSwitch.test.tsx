import { navigation } from '../../support/mockedNextNavigation';
import { inviteeAuth, PENDING_INVITE_PREVIEW, workspaceMocks } from '../../support/teamInvitePage';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-errors';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import TeamInviteAccept from '@/views/TeamInviteAccept';

type InviteLinkState = {
  preview: unknown;
  previewError: unknown;
  acceptError: unknown;
  declineError: unknown;
};

const inviteLinkState = vi.hoisted(
  (): InviteLinkState => ({ preview: undefined, previewError: null, acceptError: null, declineError: null }),
);

vi.mock('@/features/teams/useTeamInviteLink', () => ({
  useTeamInviteLink: () => ({
    ...inviteLinkState,
    isPreviewLoading: false,
    accept: vi.fn(),
    isAccepted: false,
    decline: vi.fn(),
    isDeclined: false,
    isResponding: false,
    switchToOrganization: vi.fn(),
  }),
}));

const emailMismatch = () =>
  new ApiError({
    status: 403,
    message: 'Invite is for a different email address',
    code: 'invite_email_mismatch',
  });

function renderInvitePage() {
  navigation.reset('/team-invites/invite-token', { routes: ['/team-invites/[token]'] });
  return renderToStaticMarkup(
    <TeamInviteAccept />,
  );
}

describe('Organization invite page for another account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inviteeAuth.reset();
    inviteeAuth.set({ user: { id: 'user-personal', email: 'personal@example.com' } });
    Object.assign(inviteLinkState, {
      preview: undefined,
      previewError: null,
      acceptError: null,
      declineError: null,
    });
  });

  it('names the signed-in account and offers to sign out and continue', () => {
    inviteLinkState.previewError = emailMismatch();

    const html = renderInvitePage();

    expect(html).toContain('personal@example.com');
    expect(html).toContain('This invite was sent to a different email address.');
    expect(html).toContain('Sign out and continue');
    expect(html).not.toContain('Open settings');
    expect(inviteeAuth.get().logout).not.toHaveBeenCalled();
  });

  it('offers the same way out when accepting finds the account changed', () => {
    inviteLinkState.preview = PENDING_INVITE_PREVIEW;
    inviteLinkState.acceptError = emailMismatch();

    const html = renderInvitePage();

    expect(html).toContain('Sign out and continue');
    expect(html).not.toContain('Accept invite');
  });

  it.each([
    ['an expired invite', new ApiError({ status: 410, message: 'Invite expired', code: 'invite_expired' })],
    ['a revoked invite', new ApiError({ status: 404, message: 'Invite not found' })],
  ])('keeps the settings link, and no sign-out button, for %s', (_label, error) => {
    inviteLinkState.previewError = error;

    const html = renderInvitePage();

    expect(html).toContain('Open settings');
    expect(html).not.toContain('Sign out and continue');
  });

  it("opens the account's settings in Personal from an invite that failed, whichever context the tab is in", () => {
    inviteLinkState.previewError = new ApiError({ status: 404, message: 'Invite not found' });
    workspaceMocks.consoleContext = organizationConsole('team-9');
    try {
      expect(renderInvitePage()).toMatch(/<a[^>]*href="\/dashboard\/settings\/"[^>]*>Open settings<\/a>/);
    } finally {
      workspaceMocks.consoleContext = PERSONAL_CONSOLE;
    }
  });
});
