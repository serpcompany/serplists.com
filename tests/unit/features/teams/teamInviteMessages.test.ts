import { describe, expect, it } from 'vitest';

import {
  describeTeamInviteError,
  formatTeamRole,
  isInviteEmailMismatch,
} from '@/features/teams/teamInviteMessages';
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

describe('isInviteEmailMismatch', () => {
  it('recognizes an invite for another email address by its code', () => {
    const mismatch = new ApiError({ status: 403, message: 'raw', code: 'invite_email_mismatch' });

    expect(isInviteEmailMismatch(mismatch)).toBe(true);
  });

  it.each([
    ['a 403 with another code', new ApiError({ status: 403, message: 'raw', code: 'upgrade_required' })],
    ['an expired invite', new ApiError({ status: 410, message: 'raw', code: 'invite_expired' })],
    ['a missing invite', new ApiError({ status: 404, message: 'raw' })],
    ['a network error', new Error('Network down')],
    ['no error', null],
  ])('ignores %s', (_label, error) => {
    expect(isInviteEmailMismatch(error)).toBe(false);
  });
});

describe('formatTeamRole', () => {
  it('capitalizes the role', () => {
    expect(formatTeamRole('editor')).toBe('Editor');
  });
});
