import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { renderSettled } from '../../../support/renderInTheDom';
import { useTeamSettingsForm } from '@/features/teams/useTeamSettingsForm';

type Saved = Parameters<typeof useTeamSettingsForm>[0];

const acme = { teamId: 'team-1', name: 'Acme', slug: 'acme', description: 'Growth agency' };

async function mountTheForm(saved: Saved) {
  let form: ReturnType<typeof useTeamSettingsForm> | undefined;
  function SettingsForm({ saved: shown }: { saved: Saved }) {
    form = useTeamSettingsForm(shown);
    return null;
  }
  const { rerender } = await renderSettled(<SettingsForm saved={saved} />);
  const current = () => {
    if (!form) throw new Error('The settings form did not render');
    return form;
  };
  return {
    current,
    showSaved: (next: Saved) => act(async () => rerender(<SettingsForm saved={next} />)),
  };
}

describe('the Organization settings form', () => {
  it('starts empty while no Organization is loaded, then fills in the one that loads', async () => {
    const form = await mountTheForm(null);
    expect(form.current().values).toEqual({ name: '', slug: '', description: '' });

    await form.showSaved(acme);

    expect(form.current().values).toEqual({ name: 'Acme', slug: 'acme', description: 'Growth agency' });
  });

  it('keeps what was typed when the saved Organization changes under it', async () => {
    const form = await mountTheForm(acme);
    await act(async () => form.current().setName('Acme Labs'));

    await form.showSaved({ ...acme, slug: 'acme-labs', description: 'Paid search agency' });

    expect(form.current().values).toEqual({ name: 'Acme Labs', slug: 'acme-labs', description: 'Paid search agency' });
  });

  it('empties the form when the Organization goes away', async () => {
    const form = await mountTheForm(acme);
    await act(async () => form.current().setDescription('Half typed'));

    await form.showSaved(null);

    expect(form.current().values).toEqual({ name: '', slug: '', description: '' });
  });

  it("shows another Organization's settings in place of the edits made to the first", async () => {
    const form = await mountTheForm(acme);
    await act(async () => form.current().setSlug('acme-typed'));

    await form.showSaved({ teamId: 'team-2', name: 'Beta', slug: 'beta', description: '' });

    expect(form.current().values).toEqual({ name: 'Beta', slug: 'beta', description: '' });
  });
});
