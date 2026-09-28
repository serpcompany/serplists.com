import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-errors';
import TeamInviteAccept from '@/pages/TeamInviteAccept';

// Opening an invite while signed in to another account must offer a way to
// switch accounts that keeps the invite link, instead of a dead end.

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(async () => ({ ok: true })),
  user: { id: 'user-personal', email: 'personal@example.com' } as { id: string; email: string } | null,
}));

type InviteLinkState = {
  preview: unknown;
  previewError: unknown;
  acceptError: unknown;
  declineError: unknown;
};

const inviteLinkState = vi.hoisted(
  (): InviteLinkState => ({ preview: undefined, previewError: null, acceptError: null, declineError: null }),
);

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const emailMismatch = () =>
  new ApiError({
    status: 403,
    message: 'Invite is for a different email address',
    code: 'invite_email_mismatch',
  });

function renderInvitePage() {
  return renderToStaticMarkup(
    <StaticRouter location="/team-invites/invite-token">
      <Routes>
        <Route path="/team-invites/:token" element={<TeamInviteAccept />} />
      </Routes>
    </StaticRouter>,
  );
}

describe('Organization invite page for another account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 'user-personal', email: 'personal@example.com' };
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
    expect(authState.logout).not.toHaveBeenCalled();
  });

  it('offers the same way out when accepting finds the account changed', () => {
    inviteLinkState.preview = {
      status: 'pending',
      teamId: 'team-1',
      teamName: 'Acme Corp',
      teamSlug: 'acme-corp',
      role: 'editor',
      expiresAt: '2026-10-05T00:00:00.000Z',
      inviterName: 'Owner User',
      inviterEmail: 'owner@example.com',
    };
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
});
