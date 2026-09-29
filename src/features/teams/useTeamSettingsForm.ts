import { useState } from 'react';

import { syncTeamSettingsForm, type TeamSettingsFormValues } from './teamSettingsUpdate';

type SavedTeamSettings = TeamSettingsFormValues & { teamId: string };

const EMPTY_FORM: TeamSettingsFormValues = { name: '', slug: '' };

/**
 * The Organization name and slug fields in Settings. The active workspace is rebuilt whenever
 * the Organizations list changes (Make owner patches the role, a focus refetch picks up a
 * change to any of the user's Organizations), so the form follows only the saved name and
 * slug, and keeps a field the user has changed (syncTeamSettingsForm). Another Organization,
 * or none, starts from its saved values.
 */
export function useTeamSettingsForm(saved: SavedTeamSettings | null) {
  const [values, setValues] = useState<TeamSettingsFormValues>(() =>
    saved ? { name: saved.name, slug: saved.slug } : EMPTY_FORM,
  );
  // The saved values the form last loaded or saved, for the Organization it shows.
  const [baseline, setBaseline] = useState<SavedTeamSettings | null>(saved);
  const teamId = saved?.teamId;
  const savedName = saved?.name ?? '';
  const savedSlug = saved?.slug ?? '';

  // Follows a change to the saved values (or another Organization) as soon as it renders.
  const [shown, setShown] = useState({ teamId, savedName, savedSlug });
  if (shown.teamId !== teamId || shown.savedName !== savedName || shown.savedSlug !== savedSlug) {
    setShown({ teamId, savedName, savedSlug });
    if (teamId === undefined) {
      setBaseline(null);
      setValues(EMPTY_FORM);
    } else {
      const server = { name: savedName, slug: savedSlug };
      const previous = baseline?.teamId === teamId ? baseline : null;
      setBaseline({ teamId, ...server });
      setValues((current) => syncTeamSettingsForm(current, previous, server));
    }
  }

  return {
    values,
    setName: (name: string) => setValues((current) => ({ ...current, name })),
    setSlug: (slug: string) => setValues((current) => ({ ...current, slug })),
    // After this form's own save, the answer is the saved state: the server trims the name
    // and can change the slug (a taken slug gets a suffix). Only what the user typed while
    // it saved (a field that no longer matches what was submitted) is kept.
    // A save for an Organization the form no longer shows changes nothing here.
    applySaved: (teamIdSaved: string, submitted: TeamSettingsFormValues, result: TeamSettingsFormValues) => {
      if (baseline?.teamId !== teamIdSaved) return;
      setBaseline({ teamId: teamIdSaved, ...result });
      setValues((current) => syncTeamSettingsForm(current, submitted, result));
    },
  };
}
