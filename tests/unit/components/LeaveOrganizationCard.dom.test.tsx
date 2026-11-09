import '../../support/mockedToasts';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { LeaveOrganizationCard } from '@/components/account/LeaveOrganizationCard';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

import { createTestQueryClient } from '../../fixtures/queryClient';
import { deferred } from '../../support/deferred';
import { renderSettled } from '../../support/renderInTheDom';

const workspace = vi.hoisted(() => ({ refreshTeams: vi.fn(), selectWorkspace: vi.fn() }));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: 'team-1',
    activeWorkspace: { id: 'team-1', type: 'team', name: 'Acme', role: 'editor', teamId: 'team-1', memberId: 'member-2' },
    refreshTeams: workspace.refreshTeams,
    selectWorkspace: workspace.selectWorkspace,
  }),
}));
vi.mock('@/lib/api', () => ({ api: { leaveTeam: vi.fn() } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const openTheCard = () =>
  renderSettled(
    <QueryClientProvider client={createTestQueryClient()}>
      <LeaveOrganizationCard />
    </QueryClientProvider>,
  );

const pressLeave = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Leave Organization' }));
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('leaving an Organization', () => {
  it('leaves once confirmed, saying so while it leaves, and returns to Personal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const leaving = deferred<{ success: true }>();
    vi.mocked(api.leaveTeam).mockReturnValue(leaving.promise);
    workspace.refreshTeams.mockResolvedValue([]);
    await openTheCard();

    await pressLeave();
    expect(window.confirm).toHaveBeenCalledWith('Leave Acme? You will lose access to its Templates and Runs.');
    expect((await screen.findByRole('button', { name: 'Leaving...' })).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      leaving.resolve({ success: true });
    });

    expect(api.leaveTeam).toHaveBeenCalledWith('team-1');
    expect(workspace.selectWorkspace).toHaveBeenCalledWith('personal');
    expect(toast.success).toHaveBeenCalledWith('You left Acme');
  });

  it('stays when the member cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openTheCard();

    await pressLeave();

    expect(api.leaveTeam).not.toHaveBeenCalled();
  });

  it("shows the server's reason when leaving failed", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.leaveTeam).mockRejectedValue(new ApiError({ status: 409, message: 'Transfer ownership first' }));
    await openTheCard();

    await pressLeave();

    expect(toast.error).toHaveBeenCalledWith('Transfer ownership first');
    expect(workspace.selectWorkspace).not.toHaveBeenCalled();
  });
});
