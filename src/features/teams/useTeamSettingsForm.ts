import { useState } from 'react';

import { syncTeamSettingsForm, type TeamSettingsFormValues } from './teamSettingsUpdate';

type SavedTeamSettings = TeamSettingsFormValues & { teamId: string };

const EMPTY_FORM: TeamSettingsFormValues = { name: '', slug: '' };

export function useTeamSettingsForm(saved: SavedTeamSettings | null) {
  const [values, setValues] = useState<TeamSettingsFormValues>(() =>
    saved ? { name: saved.name, slug: saved.slug } : EMPTY_FORM,
  );
  const [lastSynced, setLastSynced] = useState<SavedTeamSettings | null>(saved);
  const teamId = saved?.teamId;
  const savedName = saved?.name ?? '';
  const savedSlug = saved?.slug ?? '';

  const [shown, setShown] = useState({ teamId, savedName, savedSlug });
  if (shown.teamId !== teamId || shown.savedName !== savedName || shown.savedSlug !== savedSlug) {
    setShown({ teamId, savedName, savedSlug });
    if (teamId === undefined) {
      setLastSynced(null);
      setValues(EMPTY_FORM);
    } else {
      const server = { name: savedName, slug: savedSlug };
      const previous = lastSynced?.teamId === teamId ? lastSynced : null;
      setLastSynced({ teamId, ...server });
      setValues((current) => syncTeamSettingsForm(current, previous, server));
    }
  }

  return {
    values,
    setName: (name: string) => setValues((current) => ({ ...current, name })),
    setSlug: (slug: string) => setValues((current) => ({ ...current, slug })),
    applySaved: (teamIdSaved: string, submitted: TeamSettingsFormValues, result: TeamSettingsFormValues) => {
      if (lastSynced?.teamId !== teamIdSaved) return;
      setLastSynced({ teamId: teamIdSaved, ...result });
      setValues((current) => syncTeamSettingsForm(current, submitted, result));
    },
  };
}
