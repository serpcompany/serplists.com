import { describe, expect, it } from 'vitest';

import { describeTeamInviteError, formatTeamRole } from '@/features/teams/teamInviteMessages';
import { ApiError } from '@/lib/api-errors';

describe('describeTeamInviteError', () => {
  it.each([
    [403, /different email address/],
    [404, /no longer available/],
    [410, /expired/],
  ])('explains a %i response', (status, message) => {
    expect(describeTeamInviteError(new ApiError({ status, message: 'raw' }))).toMatch(message);
  });

  it('falls back to the error message', () => {
    expect(describeTeamInviteError(new Error('Network down'))).toBe('Network down');
    expect(describeTeamInviteError(null)).toBe('Unable to load this invite.');
  });
});

describe('formatTeamRole', () => {
  it('capitalizes the role', () => {
    expect(formatTeamRole('editor')).toBe('Editor');
  });
});
