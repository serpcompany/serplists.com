import '../../support/mockedNextNavigation';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderSettled } from '../../support/renderInTheDom';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';

const { getTeams } = vi.hoisted(() => ({ getTeams: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: { getTeams } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));

import { SESSION_RECHECK_INTERVAL_MS } from '@/contexts/sessionSync';
import { WorkspaceProvider } from '@/contexts/WorkspaceProvider';

const mountWithOrganizationsFetched = async (millisecondsAgo: number) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['teams', 'user-1'], [], { updatedAt: Date.now() - millisecondsAgo });
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>{null}</WorkspaceProvider>
    </QueryClientProvider>,
  );
  await letQueryUpdatesReachObservers();
};

describe('the Organizations list stays fresh as long as the session recheck interval', () => {
  beforeEach(() => {
    getTeams.mockReset();
    getTeams.mockResolvedValue([]);
  });

  it('reuses a list fetched within the interval, so a tab coming back into view reads no Organizations without a session check', async () => {
    await mountWithOrganizationsFetched(SESSION_RECHECK_INTERVAL_MS - 1_000);

    expect(getTeams).not.toHaveBeenCalled();
  });

  it('fetches the list again once it is older than the interval', async () => {
    await mountWithOrganizationsFetched(SESSION_RECHECK_INTERVAL_MS + 1_000);

    expect(getTeams).toHaveBeenCalledTimes(1);
  });
});
