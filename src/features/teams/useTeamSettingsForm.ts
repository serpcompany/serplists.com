import { useEffect, useRef, useState } from 'react';

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
  const baselineRef = useRef<SavedTeamSettings | null>(saved);
  const teamId = saved?.teamId;
  const savedName = saved?.name ?? '';
  const savedSlug = saved?.slug ?? '';

  useEffect(() => {
    if (teamId === undefined) {
      baselineRef.current = null;
      setValues(EMPTY_FORM);
      return;
    }

    const server = { name: savedName, slug: savedSlug };
    const previous = baselineRef.current;
    const baseline = previous?.teamId === teamId ? previous : null;
    baselineRef.current = { teamId, ...server };
    setValues((current) => syncTeamSettingsForm(current, baseline, server));
  }, [teamId, savedName, savedSlug]);

  return {
    values,
    setName: (name: string) => setValues((current) => ({ ...current, name })),
    setSlug: (slug: string) => setValues((current) => ({ ...current, slug })),
    // After this form's own save, the answer is the saved state: the server trims the name
    // and can change the slug (a taken slug gets a suffix). Only what the user typed while
    // it saved (a field that no longer matches what was submitted) is kept.
    // A save for an Organization the form no longer shows changes nothing here.
    applySaved: (teamIdSaved: string, submitted: TeamSettingsFormValues, result: TeamSettingsFormValues) => {
      if (baselineRef.current?.teamId !== teamIdSaved) return;
      baselineRef.current = { teamId: teamIdSaved, ...result };
      setValues((current) => syncTeamSettingsForm(current, submitted, result));
    },
  };
}
