export type TeamSettingsUpdate = { name?: string; slug?: string };

/**
 * The Organization settings fields that differ from the saved values, trimmed as the API
 * trims them, or null when saving would change nothing (Save stays disabled then).
 * A cleared slug is not a change: the API keeps the current slug when none is sent.
 * An emptied name is returned as `name: ''` so the form can report that it is required.
 */
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
