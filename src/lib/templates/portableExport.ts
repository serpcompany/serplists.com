import { portableTemplatePackSchema, type PortableTemplatePack } from "@/lib/schemas/checklistSchema";
import { buildPortablePackManifest } from "@/lib/schemas/portableTemplatePack";
import { isRepoTemplate } from "@/lib/repoTemplateCatalog";
import { isPersonalTemplateOf } from "@/lib/templates/templateOwnership";
import { exportPortableTemplatesToJSON } from "@/lib/utils/templateBackup";
import type { ChecklistTemplate } from "@/types/checklist";

export type ExportContext = {
  userId?: string;
  teamId?: string | null;
  ownedTemplateIds?: Iterable<string>;
  exportedSlugs?: Iterable<string>;
};

export function selectPublicTemplatesForExport(catalog: ChecklistTemplate[], context: ExportContext): ChecklistTemplate[] {
  const ownedIds = new Set(context.ownedTemplateIds ?? []);
  const exportedSlugs = new Set(context.exportedSlugs ?? []);
  return catalog.filter((template) => {
    if (!template.isPublic || isRepoTemplate(template) || ownedIds.has(template.id)) return false;
    if (template.slug && exportedSlugs.has(template.slug)) return false;
    if (context.teamId) return template.teamId !== context.teamId;
    return !isPersonalTemplateOf(template, context.userId);
  });
}

export function addPublicTemplatesToPack(ownedPack: unknown, publicTemplates: ChecklistTemplate[]): PortableTemplatePack {
  const pack = portableTemplatePackSchema.parse(ownedPack);
  if (publicTemplates.length === 0) return pack;

  const added = exportPortableTemplatesToJSON(publicTemplates);
  const templates = [...pack.templates, ...added.templates];
  const ownedSkipped = pack.manifest?.skippedTemplates ?? [];
  const skipKey = (entry: { title: string; reason: string }) => JSON.stringify([entry.title, entry.reason]);
  const alreadySkipped = new Set(ownedSkipped.map(skipKey));
  const skippedTemplates = [
    ...ownedSkipped,
    ...(added.manifest?.skippedTemplates ?? []).filter((entry) => !alreadySkipped.has(skipKey(entry))),
  ];
  return { ...pack, templates, manifest: buildPortablePackManifest(templates, skippedTemplates) };
}
