import '../../support/signedInTeamSettingsApi';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountOrganizationsSection } from '@/components/account/AccountOrganizationsSection';
import { queryKeys } from '@/lib/queryKeys';

const workspaceMocks = vi.hoisted(() => ({
  teams: [] as { id: string; memberId: string; name: string; role: string }[],
  teamsUnavailable: false,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    createTeam: vi.fn(),
    refreshTeams: vi.fn(),
    rememberTeam: vi.fn(),
    retryWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    teams: workspaceMocks.teams,
    teamsUnavailable: workspaceMocks.teamsUnavailable,
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.incomingTeamInvites('user-1'), []);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <AccountOrganizationsSection />
    </QueryClientProvider>,
  );
}

describe('AccountOrganizationsSection', () => {
  beforeEach(() => {
    workspaceMocks.teams = [];
    workspaceMocks.teamsUnavailable = false;
  });

  it('says the Organizations could not load, with Retry, instead of inviting a member of other Organizations to create a duplicate', () => {
    workspaceMocks.teamsUnavailable = true;
    const html = renderSection();

    expect(html).toContain('Couldn&#x27;t load your Organizations.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Create or select an Organization to share templates and runs.');
  });

  it('stops typing an Organization name at the limit the API accepts, rather than letting the API refuse it with a raw schema error', () => {
    const html = renderSection();

    expect(html).toMatch(/<input[^>]*id="team-name"[^>]*maxLength="120"|<input[^>]*maxLength="120"[^>]*id="team-name"/);
  });

  it("offers each of the user's Organizations to select, and manages none of them, since Account Settings is always Personal", () => {
    workspaceMocks.teams = [{ id: 'team-1', memberId: 'member-1', name: 'Acme Team', role: 'admin' }];
    const html = renderSection();

    expect(html).toContain('Your Organizations');
    expect(html).toContain('Acme Team');
    expect(html).toContain('Select');
    expect(html).not.toContain('Selected');
    expect(html).not.toContain('Your role:');
    expect(html).not.toContain('Save Organization');
  });
});
