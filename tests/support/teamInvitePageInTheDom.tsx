import { navigation, RoutedPages } from './mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

import TeamInviteAccept from '@/views/TeamInviteAccept';

import { createQueryClientWithAppDefaults } from './appQueryClient';
import { letQueryUpdatesReachObservers } from './queryNotifications';
import { renderSettled } from './renderInTheDom';

export async function openTheInvitePage() {
  const queryClient = createQueryClientWithAppDefaults();
  navigation.reset('/team-invites/invite-token', { routes: ['/team-invites/[token]'] });
  const { container, unmount } = await renderSettled(
    <QueryClientProvider client={queryClient}>
      <RoutedPages pages={{ '/team-invites/[token]': <TeamInviteAccept /> }} />
    </QueryClientProvider>,
  );
  await letQueryUpdatesReachObservers();

  const press = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
    await letQueryUpdatesReachObservers();
  };
  const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
  return { text: () => container.textContent, press, hrefOf, unmount };
}
