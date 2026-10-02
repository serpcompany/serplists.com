import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import {
  apiMocks,
  inviteeAuth as auth,
  PENDING_INVITE_PREVIEW as preview,
} from '../../support/teamInvitePage';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-errors';
import TeamInviteAccept from '@/views/TeamInviteAccept';

import { createQueryClientWithAppDefaults } from '../../support/appQueryClient';
import { deferred } from '../../support/deferred';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const inviteRevoked = () =>
  new ApiError({ status: 404, message: 'Invite not found', code: 'invite_not_found' });

const NO_LONGER_AVAILABLE = 'This invite is no longer available';

theInMemoryBrowserAsTheWindow();
let unmountTheInvitePage: () => void = () => {};

const switchAwayFromTheTabAndBack = async () => {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await letQueryUpdatesReachObservers();
};

async function openInvite() {
  const queryClient = createQueryClientWithAppDefaults();
  navigation.reset('/team-invites/invite-token', { routes: ['/team-invites/[token]'] });
  const { container, unmount } = await renderSettled(
    <QueryClientProvider client={queryClient}>
      <RoutedPages pages={{ '/team-invites/[token]': <TeamInviteAccept /> }} />
    </QueryClientProvider>,
  );
  unmountTheInvitePage = unmount;
  await letQueryUpdatesReachObservers();

  const press = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
    await letQueryUpdatesReachObservers();
  };
  return { text: () => container.textContent, press };
}

describe('Organization invite page after the invitee answers, whose confirmation no later read of the preview may replace', () => {
  beforeEach(() => {
    auth.reset();
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getTeamInvitePreview.mockResolvedValueOnce(preview);
  });

  afterEach(async () => {
    await act(async () => unmountTheInvitePage());
    focusManager.setFocused(undefined);
  });

  it('keeps "Invite declined" when the tab regains focus after a decline', async () => {
    const page = await openInvite();
    expect(page.text()).toContain('Accept invite');

    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    apiMocks.getTeamInvitePreview.mockRejectedValue(inviteRevoked());
    await page.press('Decline');
    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');

    await switchAwayFromTheTabAndBack();

    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');
    expect(page.text()).not.toContain(NO_LONGER_AVAILABLE);
    expect(apiMocks.getTeamInvitePreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the Switch to panel when a read after Accept fails', async () => {
    const page = await openInvite();

    apiMocks.acceptTeamInvite.mockResolvedValue({ memberId: 'member-1', role: 'editor', teamId: 'team-1' });
    apiMocks.getTeamInvitePreview.mockRejectedValue(new Error('Network request failed'));
    await page.press('Accept invite');
    expect(page.text()).toContain('Invite accepted.');

    await switchAwayFromTheTabAndBack();

    expect(page.text()).toContain('Invite accepted.');
    expect(page.text()).toContain('Switch to Acme Corp');
    expect(page.text()).not.toContain('Network request failed');
  });

  it('keeps "Invite declined" when a read that started before the decline fails after it', async () => {
    const page = await openInvite();
    const lateRead = deferred<typeof preview>();
    apiMocks.getTeamInvitePreview.mockReturnValueOnce(lateRead.promise);
    await switchAwayFromTheTabAndBack();
    expect(apiMocks.getTeamInvitePreview).toHaveBeenCalledTimes(2);

    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    await page.press('Decline');
    await act(async () => lateRead.reject(inviteRevoked()));
    await letQueryUpdatesReachObservers();

    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');
    expect(page.text()).not.toContain(NO_LONGER_AVAILABLE);
  });

  it('still notices on focus that an unanswered invite was revoked', async () => {
    const page = await openInvite();

    apiMocks.getTeamInvitePreview.mockRejectedValue(inviteRevoked());
    await switchAwayFromTheTabAndBack();

    expect(page.text()).toContain(NO_LONGER_AVAILABLE);
  });

  it('loads the invite for another account that signs in after a decline', async () => {
    const page = await openInvite();
    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    await page.press('Decline');
    expect(page.text()).toContain('Invite declined.');

    apiMocks.getTeamInvitePreview.mockResolvedValue({ ...preview, teamName: 'Beta Org' });
    await act(async () => auth.set({ user: { id: 'user-2', email: 'other@example.com' } }));
    await letQueryUpdatesReachObservers();

    expect(page.text()).toContain('Beta Org');
    expect(page.text()).toContain('Accept invite');
    expect(page.text()).not.toContain('Invite declined.');
  });
});
