import { portableTemplatePackSchema, type PortableTemplatePack } from "@/lib/schemas/checklistSchema";
import { buildPortablePackManifest } from "@/lib/schemas/portableTemplatePack";
import { isRepoTemplate } from "@/lib/repoTemplateCatalog";
import { isPersonalTemplateOf } from "@/lib/templates/templateOwnership";
import { exportPortableTemplatesToJSON } from "@/lib/utils/templateBackup";
import type { ChecklistTemplate } from "@/types/checklist";

// The export endpoint returns only the active context's own templates. "Include public
// community templates" adds the rest from the catalog the page already loaded (edge
// cached), so an export never reads every public template from D1.

// Catalog rows carry no team_id, so `ownedTemplateIds` (the active context's own list) is
// what recognises an Organization's own public templates there.
export type ExportContext = { userId?: string; teamId?: string | null; ownedTemplateIds?: Iterable<string> };

/**
 * Public templates an export adds: stored ones (not the bundled library) that the active
 * context does not own, since the server already exported those. In an Organization that
 * includes the user's own public Personal templates.
 */
export function selectPublicTemplatesForExport(catalog: ChecklistTemplate[], context: ExportContext): ChecklistTemplate[] {
  const ownedIds = new Set(context.ownedTemplateIds ?? []);
  return catalog.filter((template) => {
    if (!template.isPublic || isRepoTemplate(template) || ownedIds.has(template.id)) return false;
    if (context.teamId) return template.teamId !== context.teamId;
    return !isPersonalTemplateOf(template, context.userId);
  });
}

/** Adds public templates to the server's pack of owned templates, with one manifest for both. */
export function addPublicTemplatesToPack(ownedPack: unknown, publicTemplates: ChecklistTemplate[]): PortableTemplatePack {
  const pack = portableTemplatePackSchema.parse(ownedPack);
  if (publicTemplates.length === 0) return pack;

  const added = exportPortableTemplatesToJSON(publicTemplates);
  const templates = [...pack.templates, ...added.templates];
  const skippedTemplates = [...(pack.manifest?.skippedTemplates ?? []), ...(added.manifest?.skippedTemplates ?? [])];
  return { ...pack, templates, manifest: buildPortablePackManifest(templates, skippedTemplates) };
}
