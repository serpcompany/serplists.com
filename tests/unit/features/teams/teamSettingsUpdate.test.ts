import { describe, expect, it } from 'vitest';

import { getTeamSettingsUpdate, syncTeamSettingsForm } from '@/features/teams/teamSettingsUpdate';

const saved = { name: 'Acme', slug: 'acme', description: 'Growth agency' };
const draft = (name: string, slug: string, description = 'Growth agency') => ({ name, slug, description });

describe('getTeamSettingsUpdate', () => {
  it('has nothing to save when the form matches the saved Organization', () => {
    expect(getTeamSettingsUpdate(draft('Acme', 'acme'), saved)).toBeNull();
  });

  it('ignores whitespace the API would trim away', () => {
    expect(getTeamSettingsUpdate(draft('  Acme ', ' acme  ', ' Growth agency\n'), saved)).toBeNull();
  });

  it('treats a cleared slug as unchanged, since the API cannot remove a slug', () => {
    expect(getTeamSettingsUpdate(draft('Acme', '  '), saved)).toBeNull();
  });

  it('compares against an empty slug and description when the Organization has none', () => {
    expect(getTeamSettingsUpdate(draft('Acme', '', ''), { name: 'Acme', slug: null, description: null })).toBeNull();
    expect(getTeamSettingsUpdate(draft('Acme', '', ''), { name: 'Acme' })).toBeNull();
    expect(getTeamSettingsUpdate(draft('Acme', 'acme-ops', ''), { name: 'Acme', slug: null })).toEqual({
      slug: 'acme-ops',
    });
  });

  it('sends only the fields that changed, trimmed', () => {
    expect(getTeamSettingsUpdate(draft(' New ', 'acme'), saved)).toEqual({ name: 'New' });
    expect(getTeamSettingsUpdate(draft('Acme', 'acme-ops '), saved)).toEqual({ slug: 'acme-ops' });
    expect(getTeamSettingsUpdate(draft('Acme', 'acme', ' Paid search agency '), saved)).toEqual({
      description: 'Paid search agency',
    });
    expect(getTeamSettingsUpdate(draft('New', 'new'), saved)).toEqual({ name: 'New', slug: 'new' });
  });

  it('sends a cleared description as null, which removes it', () => {
    expect(getTeamSettingsUpdate(draft('Acme', 'acme', '   '), saved)).toEqual({ description: null });
  });

  it('reports an emptied name as a change so the form can say the name is required', () => {
    expect(getTeamSettingsUpdate(draft('   ', 'acme'), saved)).toEqual({ name: '' });
  });
});

describe('syncTeamSettingsForm merges the saved values into what the user typed, since the Organizations list rebuilds the active context on every change', () => {
  const baseline = draft('Acme', 'acme');

  it('keeps a changed name and lets a clean slug and description follow the server', () => {
    expect(
      syncTeamSettingsForm(draft('Acme Marketing', 'acme'), baseline, draft('Acme', 'acme-group', 'Search agency')),
    ).toEqual(draft('Acme Marketing', 'acme-group', 'Search agency'));
  });

  it('keeps a changed slug, a cleared one included, and a changed description, when the saved name changes elsewhere', () => {
    expect(syncTeamSettingsForm(draft('Acme', '', 'Draft text'), baseline, draft('Acme Group', 'acme'))).toEqual(
      draft('Acme Group', '', 'Draft text'),
    );
  });

  it('compares the raw text, so typed spaces are still an edit', () => {
    expect(syncTeamSettingsForm(draft('Acme ', 'acme'), baseline, baseline)).toEqual(draft('Acme ', 'acme'));
  });

  it('takes the server values with no baseline (first load, another Organization)', () => {
    expect(syncTeamSettingsForm(draft('Acme Marketing', 'x'), null, draft('Globex', 'globex', ''))).toEqual(
      draft('Globex', 'globex', ''),
    );
  });

  it('after a save, shows what the server stored unless the user typed on meanwhile', () => {
    const submitted = draft(' Acme Marketing ', 'acme-mkt');
    const stored = draft('Acme Marketing', 'acme-mkt-2');

    expect(syncTeamSettingsForm(submitted, submitted, stored)).toEqual(stored);
    expect(syncTeamSettingsForm({ ...submitted, name: 'Acme Marketing Ltd' }, submitted, stored)).toEqual({
      ...stored,
      name: 'Acme Marketing Ltd',
    });
  });
});
