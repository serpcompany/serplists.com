import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ api: { leaveTeam: vi.fn() } }));

import { afterLeavingOrganization } from '@/features/teams/useLeaveOrganization';

describe('afterLeavingOrganization', () => {
  it('returns to Personal when the left Organization was active and reloads Organizations', async () => {
    const calls: string[] = [];
    const selectWorkspace = vi.fn((id: string) => calls.push(`select:${id}`));
    const refreshTeams = vi.fn(async () => {
      calls.push('refresh');
      return [];
    });

    await afterLeavingOrganization('team-1', { activeTeamId: 'team-1', refreshTeams, selectWorkspace });

    expect(calls).toEqual(['select:personal', 'refresh']);
  });

  it('keeps the current context when another Organization was left', async () => {
    const selectWorkspace = vi.fn();
    const refreshTeams = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(
      afterLeavingOrganization('team-1', { activeTeamId: 'team-2', refreshTeams, selectWorkspace }),
    ).resolves.toBeUndefined();

    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });
});
