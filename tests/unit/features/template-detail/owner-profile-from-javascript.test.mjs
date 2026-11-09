import { describe, expect, it } from 'vitest';

import { resolveTemplateOwnerProfile } from '../../../../src/features/template-detail/templateDetailMappers';

const template = {
  id: 'template-1',
  title: 'Launch Checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: true,
  ownerProfile: { username: 'alice', full_name: 'Alice Example' },
};

describe('resolveTemplateOwnerProfile given a profile with no username, which the profile type rules out', () => {
  it("keeps the template's own username and its link, and takes the profile's new name", () => {
    expect(resolveTemplateOwnerProfile(template, { full_name: 'Alice Renamed' })).toEqual({
      ownerSlug: 'alice',
      template: { ...template, ownerProfile: { username: 'alice', full_name: 'Alice Renamed' } },
    });
  });
});
