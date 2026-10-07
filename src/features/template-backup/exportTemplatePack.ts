import { z } from 'zod';

import { api } from '@/lib/api';
import {
  exportedTemplatePackSchema,
  type ExportedTemplatePack,
  type PublicRequiredTools,
} from '@/lib/schemas/apiTemplates';
import { PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX, type RequiredTool } from '@/lib/schemas/requiredTools';
import { addPublicTemplatesToPack, selectPublicTemplatesForExport } from '@/lib/templates/portableExport';
import { getExportSummary, type PortableExportSummary } from '@/lib/templates/templateImportSummary';
import type { ChecklistTemplate } from '@/types/checklist';

const exportedSlugSchema = z.object({ slug: z.string().min(1) }).passthrough();
const readExportedSlugs = (templates: unknown[]): string[] =>
  templates.flatMap((template) => {
    const parsed = exportedSlugSchema.safeParse(template);
    return parsed.success ? [parsed.data.slug] : [];
  });

type ExportBackup = (params: { teamId?: string | undefined }) => Promise<unknown>;
type LoadPublicCatalog = () => Promise<ChecklistTemplate[]>;
type LoadPublicRequiredTools = (templateIds: readonly string[]) => Promise<PublicRequiredTools>;

type ExportTemplatePackDependencies = {
  download: (pack: ExportedTemplatePack) => void;
  exportBackup?: ExportBackup;
  loadPublicCatalog?: LoadPublicCatalog;
  loadPublicRequiredTools?: LoadPublicRequiredTools;
};

export type ExportTemplatePackOptions = {
  includePublic: boolean;
  teamId?: string | undefined;
  userId?: string | undefined;
  ownedTemplateIds?: Iterable<string> | undefined;
};

export type ExportTemplatePackResult = PortableExportSummary;

const defaultExportBackup: ExportBackup = (params) => api.exportTemplateBackup(params);
const defaultLoadPublicRequiredTools: LoadPublicRequiredTools = (templateIds) => api.getPublicRequiredTools(templateIds);

const withTheirRequiredTools = async (
  templates: ChecklistTemplate[],
  loadPublicRequiredTools: LoadPublicRequiredTools,
): Promise<ChecklistTemplate[]> => {
  const toolsByTemplateId = new Map<string, RequiredTool[]>();
  for (let start = 0; start < templates.length; start += PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX) {
    const templateIds = templates.slice(start, start + PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX).map((template) => template.id);
    for (const { id, requiredTools } of await loadPublicRequiredTools(templateIds)) {
      toolsByTemplateId.set(id, requiredTools);
    }
  }
  return templates.map((template) => {
    const requiredTools = toolsByTemplateId.get(template.id);
    return requiredTools ? { ...template, requiredTools } : template;
  });
};

export const EXPORT_PACK_UNREADABLE_MESSAGE = 'The export could not be read. Try again.';

const readSummary = (pack: unknown): PortableExportSummary => {
  try {
    return getExportSummary(pack);
  } catch {
    throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
  }
};

export const exportTemplatePack = async (
  options: ExportTemplatePackOptions,
  dependencies: ExportTemplatePackDependencies,
): Promise<ExportTemplatePackResult> => {
  const exportBackup = dependencies.exportBackup ?? defaultExportBackup;
  const ownedPack = await exportBackup({ teamId: options.teamId });
  const parsedPack = exportedTemplatePackSchema.safeParse(ownedPack);
  if (!parsedPack.success) {
    throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
  }

  let pack: ExportedTemplatePack = parsedPack.data;
  if (options.includePublic && dependencies.loadPublicCatalog) {
    const chosenTemplates = selectPublicTemplatesForExport(await dependencies.loadPublicCatalog(), {
      userId: options.userId,
      teamId: options.teamId,
      ownedTemplateIds: options.ownedTemplateIds,
      exportedSlugs: readExportedSlugs(parsedPack.data.templates),
    });
    if (chosenTemplates.length > 0) {
      const publicTemplates = await withTheirRequiredTools(
        chosenTemplates,
        dependencies.loadPublicRequiredTools ?? defaultLoadPublicRequiredTools,
      );
      try {
        pack = addPublicTemplatesToPack(ownedPack, publicTemplates);
      } catch {
        throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
      }
    }
  }

  const summary = readSummary(pack);
  if (summary.exported > 0) {
    dependencies.download(pack);
  }
  return summary;
};
