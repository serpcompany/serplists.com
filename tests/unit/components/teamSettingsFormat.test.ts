import { describe, expect, it } from 'vitest';

import { describeMemberForControls } from '@/components/account/teamSettingsFormat';

describe('describeMemberForControls', () => {
  it.each([
    ['name and email', { name: 'Alice', email: 'alice@example.com', user_id: 'user-1' }, 'Alice (alice@example.com)'],
    ['email only', { name: null, email: 'bob@example.com', user_id: 'user-2' }, 'bob@example.com'],
    ['an empty name', { name: '', email: 'bob@example.com', user_id: 'user-2' }, 'bob@example.com'],
    ['name only', { name: 'Carol', email: null, user_id: 'user-3' }, 'Carol (user-3)'],
    ['neither', { name: null, email: null, user_id: 'user-4' }, 'user-4'],
  ])('names a member with %s', (_label, member, expected) => {
    expect(describeMemberForControls(member)).toBe(expected);
  });
});
