import { portableTemplatePackSchema, type PortableTemplatePack } from "@/lib/schemas/checklistSchema";
import { buildPortablePackManifest } from "@/lib/schemas/portableTemplatePack";
import { isRepoTemplate } from "@/lib/repoTemplateCatalog";
import { exportPortableTemplatesToJSON } from "@/lib/utils/templateBackup";
import type { ChecklistTemplate } from "@/types/checklist";

// The export endpoint returns only the active context's own templates. "Include public
// community templates" adds the rest from the catalog the page already loaded (edge
// cached), so an export never reads every public template from D1.

export type ExportContext = { userId?: string; teamId?: string | null };

/**
 * Public templates an export adds: stored ones (not the bundled library) that the active
 * context does not own, since the server already exported those. In an Organization that
 * includes the user's own public Personal templates.
 */
export function selectPublicTemplatesForExport(catalog: ChecklistTemplate[], context: ExportContext): ChecklistTemplate[] {
  return catalog.filter((template) => {
    if (!template.isPublic || isRepoTemplate(template)) return false;
    if (context.teamId) return template.teamId !== context.teamId;
    return !(template.userId === context.userId && !template.teamId);
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
