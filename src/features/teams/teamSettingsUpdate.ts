export type TeamSettingsUpdate = {
  name?: string;
  slug?: string;
  description?: string | null;
  avatar_url?: string | null;
};

export type TeamSettingsFormValues = { name: string; slug: string; description: string };

export function getTeamSettingsUpdate(
  draft: TeamSettingsFormValues,
  saved: { name: string; slug?: string | null | undefined; description?: string | null | undefined },
): TeamSettingsUpdate | null {
  const name = draft.name.trim();
  const slug = draft.slug.trim();
  const description = draft.description.trim();
  const update: TeamSettingsUpdate = {};

  if (name !== saved.name) {
    update.name = name;
  }
  if (slug && slug !== (saved.slug ?? '')) {
    update.slug = slug;
  }
  if (description !== (saved.description ?? '')) {
    update.description = description || null;
  }

  return Object.keys(update).length > 0 ? update : null;
}

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
    description: current.description !== lastSynced.description ? current.description : server.description,
  };
}
