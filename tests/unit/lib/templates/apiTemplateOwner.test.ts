import { describe, expect, it } from 'vitest';

import { readApiTemplateTeamId } from '@/lib/templates/apiTemplateOwner';

describe('readApiTemplateTeamId', () => {
  it('reads the owning Organization from API rows', () => {
    expect(readApiTemplateTeamId({ owner_type: 'team', team_id: 'team-1' })).toBe('team-1');
    expect(readApiTemplateTeamId({ team_id: 'team-1' })).toBe('team-1');
    expect(readApiTemplateTeamId({ teamId: 'team-2' })).toBe('team-2');
  });

  it('treats Personal and malformed rows as Personal', () => {
    expect(readApiTemplateTeamId({ owner_type: 'user', team_id: null })).toBeUndefined();
    expect(readApiTemplateTeamId({ owner_type: 'user', team_id: 'team-1' })).toBeUndefined();
    expect(readApiTemplateTeamId({ team_id: '' })).toBeUndefined();
    expect(readApiTemplateTeamId({ team_id: 42 })).toBeUndefined();
    expect(readApiTemplateTeamId({})).toBeUndefined();
  });
});
