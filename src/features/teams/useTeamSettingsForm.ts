import { useState } from 'react';

import { syncTeamSettingsForm, type TeamSettingsFormValues } from './teamSettingsUpdate';

type SavedTeamSettings = TeamSettingsFormValues & { teamId: string };

const EMPTY_FORM: TeamSettingsFormValues = { name: '', slug: '', description: '' };

export function useTeamSettingsForm(saved: SavedTeamSettings | null) {
  const [values, setValues] = useState<TeamSettingsFormValues>(() =>
    saved ? { name: saved.name, slug: saved.slug, description: saved.description } : EMPTY_FORM,
  );
  const [lastSynced, setLastSynced] = useState<SavedTeamSettings | null>(saved);
  const teamId = saved?.teamId;
  const savedName = saved?.name ?? '';
  const savedSlug = saved?.slug ?? '';
  const savedDescription = saved?.description ?? '';

  const [shown, setShown] = useState({ teamId, savedName, savedSlug, savedDescription });
  if (
    shown.teamId !== teamId ||
    shown.savedName !== savedName ||
    shown.savedSlug !== savedSlug ||
    shown.savedDescription !== savedDescription
  ) {
    setShown({ teamId, savedName, savedSlug, savedDescription });
    if (teamId === undefined) {
      setLastSynced(null);
      setValues(EMPTY_FORM);
    } else {
      const server = { name: savedName, slug: savedSlug, description: savedDescription };
      const previous = lastSynced?.teamId === teamId ? lastSynced : null;
      setLastSynced({ teamId, ...server });
      setValues((current) => syncTeamSettingsForm(current, previous, server));
    }
  }

  return {
    values,
    setName: (name: string) => setValues((current) => ({ ...current, name })),
    setSlug: (slug: string) => setValues((current) => ({ ...current, slug })),
    setDescription: (description: string) => setValues((current) => ({ ...current, description })),
    applySaved: (teamIdSaved: string, submitted: TeamSettingsFormValues, result: TeamSettingsFormValues) => {
      if (lastSynced?.teamId !== teamIdSaved) return;
      setLastSynced({ teamId: teamIdSaved, ...result });
      setValues((current) => syncTeamSettingsForm(current, submitted, result));
    },
  };
}
