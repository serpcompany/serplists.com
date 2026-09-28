import { describe, expect, it } from 'vitest';

import { getTeamSettingsUpdate } from '@/features/teams/teamSettingsUpdate';

const saved = { name: 'Acme', slug: 'acme' };

describe('getTeamSettingsUpdate', () => {
  it('has nothing to save when the form matches the saved Organization', () => {
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: 'acme' }, saved)).toBeNull();
  });

  it('ignores whitespace the API would trim away', () => {
    expect(getTeamSettingsUpdate({ name: '  Acme ', slug: ' acme  ' }, saved)).toBeNull();
  });

  it('treats a cleared slug as unchanged, since the API cannot remove a slug', () => {
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: '  ' }, saved)).toBeNull();
  });

  it('compares against an empty slug when the Organization has none', () => {
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: '' }, { name: 'Acme', slug: null })).toBeNull();
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: '' }, { name: 'Acme' })).toBeNull();
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: 'acme-ops' }, { name: 'Acme', slug: null })).toEqual({
      slug: 'acme-ops',
    });
  });

  it('sends only the fields that changed, trimmed', () => {
    expect(getTeamSettingsUpdate({ name: ' New ', slug: 'acme' }, saved)).toEqual({ name: 'New' });
    expect(getTeamSettingsUpdate({ name: 'Acme', slug: 'acme-ops ' }, saved)).toEqual({ slug: 'acme-ops' });
    expect(getTeamSettingsUpdate({ name: 'New', slug: 'new' }, saved)).toEqual({ name: 'New', slug: 'new' });
  });

  it('reports an emptied name as a change so the form can say the name is required', () => {
    expect(getTeamSettingsUpdate({ name: '   ', slug: 'acme' }, saved)).toEqual({ name: '' });
  });
});
