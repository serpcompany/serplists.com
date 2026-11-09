import { navigation } from '../../support/mockedNextNavigation';
import {
  apiMocks,
  inviteeAuth as auth,
  PENDING_INVITE_PREVIEW as preview,
} from '../../support/teamInvitePage';
import { act } from 'react';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api-errors';

import { deferred } from '../../support/deferred';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { openTheInvitePage } from '../../support/teamInvitePageInTheDom';

theInMemoryBrowserAsTheWindow();
let unmountTheInvitePage: () => void = () => {};

const openInvite = async () => {
  const page = await openTheInvitePage();
  unmountTheInvitePage = page.unmount;
  return page;
};

const inviteForAnotherEmail = () =>
  new ApiError({ status: 403, message: 'Invite is for a different email address', code: 'invite_email_mismatch' });

beforeEach(() => {
  auth.reset();
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(async () => {
  await act(async () => unmountTheInvitePage());
});

describe('Organization invite page before the invite shows', () => {
  it('waits for the session check before it reads the invite', async () => {
    auth.set({ isLoading: true });

    const page = await openInvite();

    expect(page.text()).toContain('Checking your session...');
    expect(apiMocks.getTeamInvitePreview).not.toHaveBeenCalled();
  });

  it('asks to log in, and reads no invite, when the session has signed out but still names the last user', async () => {
    apiMocks.getTeamInvitePreview.mockResolvedValue(preview);
    auth.set({ isAuthenticated: false });

    const page = await openInvite();

    expect(page.text()).toContain('Log in to accept');
    expect(apiMocks.getTeamInvitePreview).not.toHaveBeenCalled();
  });

  it('reads no invite while the session says signed in but has no user yet', async () => {
    apiMocks.getTeamInvitePreview.mockResolvedValue(preview);
    auth.set({ user: null });

    const page = await openInvite();

    expect(page.text()).toContain('Loading invite...');
    expect(page.text()).not.toContain('Acme Corp');
    expect(apiMocks.getTeamInvitePreview).not.toHaveBeenCalled();
  });
});

describe('Organization invite inviter line', () => {
  it.each([
    ['the inviter email when the inviter has no name', { inviterName: '' }, 'owner@example.com invited you'],
    ['an Organization admin when the invite names nobody', { inviterName: '', inviterEmail: '' }, 'An Organization admin invited you'],
  ])('names %s', async (_case, inviter, line) => {
    apiMocks.getTeamInvitePreview.mockResolvedValue({ ...preview, ...inviter });

    const page = await openInvite();

    expect(page.text()).toContain(line);
  });
});

describe('Organization invite answer', () => {
  it('holds both answers while one is being sent, and shows why it failed after', async () => {
    apiMocks.getTeamInvitePreview.mockResolvedValue(preview);
    const accepting = deferred<never>();
    apiMocks.acceptTeamInvite.mockReturnValue(accepting.promise);
    const page = await openInvite();

    await page.press('Accept invite');
    expect(screen.getByRole('button', { name: 'Responding...' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      accepting.reject(new ApiError({ status: 410, message: 'Invite expired', code: 'invite_expired' }));
    });
    await letQueryUpdatesReachObservers();

    expect(page.text()).toContain('This invite has expired. Ask an Organization admin for a new link.');
    expect(screen.getByRole('button', { name: 'Accept invite' }).hasAttribute('disabled')).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Organization invite for another account', () => {
  beforeEach(() => {
    apiMocks.getTeamInvitePreview.mockRejectedValue(inviteForAnotherEmail());
  });

  it('signs out, then opens sign in with the way back to the invite', async () => {
    const signingOut = deferred<{ ok: boolean }>();
    const logout = vi.fn(() => signingOut.promise);
    auth.set({ logout });
    const page = await openInvite();

    await page.press('Sign out and continue');
    expect(screen.getByRole('button', { name: 'Signing out...' }).hasAttribute('disabled')).toBe(true);
    expect(navigation.url()).toBe('/team-invites/invite-token');

    await act(async () => {
      signingOut.resolve({ ok: true });
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/login/?next=%2Fteam-invites%2Finvite-token');
  });

  it('stays on the invite and says why when signing out fails', async () => {
    auth.set({ logout: vi.fn(async () => ({ ok: false, error: 'Could not reach the server' })) });
    const page = await openInvite();

    await page.press('Sign out and continue');

    expect(toast.error).toHaveBeenCalledWith('Could not reach the server');
    expect(navigation.url()).toBe('/team-invites/invite-token');
    expect(screen.getByRole('button', { name: 'Sign out and continue' }).hasAttribute('disabled')).toBe(false);
  });

  it('leaves out the signed-in address when the account has none', async () => {
    auth.set({ user: { id: 'user-1', email: '' } });

    const page = await openInvite();

    expect(page.text()).toContain('This invite was sent to a different email address.');
    expect(page.text()).not.toContain("You're signed in as");
  });
});
