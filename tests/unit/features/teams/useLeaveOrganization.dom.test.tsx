import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderSettled } from '../../../support/renderInTheDom';

const workspace = vi.hoisted(() => ({
  activeTeamId: 'team-1',
  refreshTeams: vi.fn(async () => []),
  selectWorkspace: vi.fn<(workspaceId: string) => void>(),
}));
const leaveTeam = vi.hoisted(() => vi.fn<(teamId: string) => Promise<{ success: true }>>());
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspace }));
vi.mock('@/lib/api', () => ({ api: { leaveTeam } }));

import { useLeaveOrganization } from '@/features/teams/useLeaveOrganization';
import { queryKeys } from '@/lib/queryKeys';

async function mountLeaveControl() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-1'), ['members of team-1']);
  queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-2'), ['members of team-2']);
  let leave: ReturnType<typeof useLeaveOrganization> | undefined;
  function LeaveControl() {
    leave = useLeaveOrganization();
    return null;
  }
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <LeaveControl />
    </QueryClientProvider>,
  );
  const control = () => {
    if (!leave) throw new Error('The leave control did not render');
    return leave;
  };
  return { queryClient, control };
}

describe('leaving an Organization', () => {
  beforeEach(() => {
    leaveTeam.mockReset();
    workspace.refreshTeams.mockClear();
    workspace.selectWorkspace.mockReset();
  });

  it('returns to Personal, reloads the Organizations, and forgets the members of the one left', async () => {
    leaveTeam.mockResolvedValue({ success: true });
    const { queryClient, control } = await mountLeaveControl();

    await act(async () => {
      await control().leaveOrganization('team-1');
    });

    expect(leaveTeam).toHaveBeenCalledWith('team-1');
    expect(workspace.selectWorkspace).toHaveBeenCalledWith('personal');
    expect(workspace.refreshTeams).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.teamMembers('user-1', 'team-1'))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.teamMembers('user-1', 'team-2'))).toEqual(['members of team-2']);
    expect(control().isLeaving).toBe(false);
  });

  it('keeps everything when the server refuses the leave', async () => {
    leaveTeam.mockRejectedValue(new Error('The owner cannot leave'));
    const { queryClient, control } = await mountLeaveControl();

    await act(async () => {
      await expect(control().leaveOrganization('team-1')).rejects.toThrow('The owner cannot leave');
    });

    expect(workspace.selectWorkspace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.teamMembers('user-1', 'team-1'))).toEqual(['members of team-1']);
  });
});
