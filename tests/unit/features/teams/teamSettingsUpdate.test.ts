import { describe, expect, it } from 'vitest';

import { getTeamSettingsUpdate, syncTeamSettingsForm } from '@/features/teams/teamSettingsUpdate';

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

describe('syncTeamSettingsForm merges the saved values into what the user typed, since the Organizations list rebuilds the active context on every change', () => {
  const baseline = { name: 'Acme', slug: 'acme' };

  it('keeps a changed name and lets a clean slug follow the server', () => {
    expect(
      syncTeamSettingsForm({ name: 'Acme Marketing', slug: 'acme' }, baseline, { name: 'Acme', slug: 'acme-group' }),
    ).toEqual({ name: 'Acme Marketing', slug: 'acme-group' });
  });

  it('keeps a changed slug, a cleared one included, when the saved name changes elsewhere', () => {
    expect(syncTeamSettingsForm({ name: 'Acme', slug: '' }, baseline, { name: 'Acme Group', slug: 'acme' })).toEqual({
      name: 'Acme Group',
      slug: '',
    });
  });

  it('compares the raw text, so typed spaces are still an edit', () => {
    expect(syncTeamSettingsForm({ name: 'Acme ', slug: 'acme' }, baseline, baseline)).toEqual({
      name: 'Acme ',
      slug: 'acme',
    });
  });

  it('takes the server values with no baseline (first load, another Organization)', () => {
    expect(syncTeamSettingsForm({ name: 'Acme Marketing', slug: 'x' }, null, { name: 'Globex', slug: 'globex' })).toEqual({
      name: 'Globex',
      slug: 'globex',
    });
  });

  it('after a save, shows what the server stored unless the user typed on meanwhile', () => {
    const submitted = { name: ' Acme Marketing ', slug: 'acme-mkt' };
    const stored = { name: 'Acme Marketing', slug: 'acme-mkt-2' };

    expect(syncTeamSettingsForm(submitted, submitted, stored)).toEqual(stored);
    expect(syncTeamSettingsForm({ ...submitted, name: 'Acme Marketing Ltd' }, submitted, stored)).toEqual({
      name: 'Acme Marketing Ltd',
      slug: 'acme-mkt-2',
    });
  });
});
