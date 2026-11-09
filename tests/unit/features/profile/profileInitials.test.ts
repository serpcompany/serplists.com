import { describe, expect, it } from 'vitest';

import { profileInitials } from '@/features/profile/profileInitials';

describe('the initials shown when a profile has no avatar', () => {
  it('takes the first letters of the first two words, without the @ of a handle', () => {
    expect(profileInitials('alice example jones')).toBe('AE');
    expect(profileInitials('@acme-launch')).toBe('A');
  });

  it('falls back to SL for a blank name or a bare @', () => {
    expect(profileInitials('')).toBe('SL');
    expect(profileInitials('   ')).toBe('SL');
    expect(profileInitials('@')).toBe('SL');
  });
});
