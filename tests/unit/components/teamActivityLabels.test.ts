import { describe, expect, it } from 'vitest';

import { formatTeamActivityAction } from '@/components/account/teamActivityLabels';

describe('formatTeamActivityAction', () => {
  it('labels self-service membership changes', () => {
    expect(formatTeamActivityAction('team_invite.declined')).toBe('Invite declined');
    expect(formatTeamActivityAction('team_member.left')).toBe('Member left');
  });

  it('falls back to the raw action', () => {
    expect(formatTeamActivityAction('something.new')).toBe('something.new');
  });
});
