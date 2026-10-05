import { describe, expect, it } from 'vitest';

import { findHandleProblems, formatHandleReport, type HandleOwner } from '../../../scripts/check-public-handles-lib';

const user = (ownerId: string, value: string): HandleOwner => ({ owner_type: 'user', owner_id: ownerId, value });
const organization = (ownerId: string, value: string): HandleOwner => ({ owner_type: 'team', owner_id: ownerId, value });

describe('the public handle collision check', () => {
  it('finds a User and an Organization, or two owners of one type, whose values match without regard to case', () => {
    const problems = findHandleProblems([
      user('u-1', 'Acme'),
      organization('t-1', 'acme'),
      user('u-2', 'JaneDoe'),
      user('u-3', 'janedoe'),
      user('u-4', 'solo'),
    ]);

    expect(problems.collisions).toEqual([
      { handle: 'acme', owners: [user('u-1', 'Acme'), organization('t-1', 'acme')] },
      { handle: 'janedoe', owners: [user('u-2', 'JaneDoe'), user('u-3', 'janedoe')] },
    ]);
  });

  it('lists values outside the handle rule without counting them as collisions', () => {
    const tooLong = 'a'.repeat(31);

    const problems = findHandleProblems([organization('t-1', tooLong), user('u-1', 'ab'), user('u-2', 'jane doe'), user('u-3', 'jane.doe_1-x')]);

    expect(problems.collisions).toEqual([]);
    expect(problems.invalid.map(({ owner }) => owner.owner_id)).toEqual(['t-1', 'u-1', 'u-2']);
  });

  it('reports the counts, then each collision and each value outside the rule', () => {
    const owners = [user('u-1', 'Acme'), organization('t-1', 'acme'), user('u-2', 'ab')];

    expect(formatHandleReport('staging', owners.length, findHandleProblems(owners))).toEqual([
      'Public handles on staging: 3 usernames and Organization slugs checked, 1 collision(s), 1 outside the handle rule.',
      'Collision on "acme": User u-1 ("Acme"), Organization t-1 ("acme"). Rename all but one by hand before applying 0028.',
      'Outside the handle rule: User u-2 ("ab"): Use at least 3 characters. It is kept and registered as it is.',
    ]);
  });
});
