export type TeamSettingsUpdate = { name?: string; slug?: string };

export function getTeamSettingsUpdate(
  draft: { name: string; slug: string },
  saved: { name: string; slug?: string | null },
): TeamSettingsUpdate | null {
  const name = draft.name.trim();
  const slug = draft.slug.trim();
  const update: TeamSettingsUpdate = {};

  if (name !== saved.name) {
    update.name = name;
  }
  if (slug && slug !== (saved.slug ?? '')) {
    update.slug = slug;
  }

  return Object.keys(update).length > 0 ? update : null;
}

export type TeamSettingsFormValues = { name: string; slug: string };

export function syncTeamSettingsForm(
  current: TeamSettingsFormValues,
  lastSynced: TeamSettingsFormValues | null,
  server: TeamSettingsFormValues,
): TeamSettingsFormValues {
  if (!lastSynced) {
    return server;
  }

  return {
    name: current.name !== lastSynced.name ? current.name : server.name,
    slug: current.slug !== lastSynced.slug ? current.slug : server.slug,
  };
}
