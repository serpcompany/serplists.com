import { describe, expect, it } from 'vitest';
import { elementAt } from '../../../support/elements';

import { patchTeamSummary } from '@/features/teams/teamSummaries';
import type { TeamSummary } from '@/lib/api';

const team = (id: string, overrides: Partial<TeamSummary> = {}): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name: `Organization ${id}`,
  role: 'owner',
  slug: id,
  ...overrides,
});

describe('patchTeamSummary', () => {
  it('demotes the previous owner in place after a transfer, keeping the list order', () => {
    const teams = [team('team-1'), team('team-2')];

    const patched = patchTeamSummary(teams, 'team-2', { role: 'admin' });

    expect(patched.map((entry) => [entry.id, entry.role])).toEqual([
      ['team-1', 'owner'],
      ['team-2', 'admin'],
    ]);
    expect(elementAt(teams, 1).role).toBe('owner');
  });

  it('returns the same list when the Organization is not in it', () => {
    const teams = [team('team-1')];

    expect(patchTeamSummary(teams, 'team-9', { role: 'admin' })).toBe(teams);
  });
});
