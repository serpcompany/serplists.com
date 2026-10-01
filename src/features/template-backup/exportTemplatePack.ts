import { z } from 'zod';

import { api } from '@/lib/api';
import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';
import { addPublicTemplatesToPack, selectPublicTemplatesForExport } from '@/lib/templates/portableExport';
import { getExportSummary, type PortableExportSummary } from '@/lib/templates/templateImportSummary';
import type { ChecklistTemplate } from '@/types/checklist';

const exportedPackSchema = z
  .object({ templates: z.array(z.unknown()) })
  .passthrough();

const exportedSlugSchema = z.object({ slug: z.string().min(1) }).passthrough();
const readExportedSlugs = (templates: unknown[]): string[] =>
  templates.flatMap((template) => {
    const parsed = exportedSlugSchema.safeParse(template);
    return parsed.success ? [parsed.data.slug] : [];
  });

type ExportBackup = (params: { teamId?: string | undefined }) => Promise<unknown>;
type LoadPublicCatalog = () => Promise<ChecklistTemplate[]>;

type ExportTemplatePackDependencies = {
  download: (pack: PortableTemplatePack) => void;
  exportBackup?: ExportBackup;
  loadPublicCatalog?: LoadPublicCatalog;
};

export type ExportTemplatePackOptions = {
  includePublic: boolean;
  teamId?: string | undefined;
  userId?: string | undefined;
  ownedTemplateIds?: Iterable<string> | undefined;
};

export type ExportTemplatePackResult = PortableExportSummary;

const defaultExportBackup: ExportBackup = (params) => api.exportTemplateBackup(params);

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
  const parsedPack = exportedPackSchema.safeParse(ownedPack);
  if (!parsedPack.success) {
    throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
  }

  let pack: unknown = ownedPack;
  if (options.includePublic && dependencies.loadPublicCatalog) {
    const publicTemplates = selectPublicTemplatesForExport(await dependencies.loadPublicCatalog(), {
      userId: options.userId,
      teamId: options.teamId,
      ownedTemplateIds: options.ownedTemplateIds,
      exportedSlugs: readExportedSlugs(parsedPack.data.templates),
    });
    if (publicTemplates.length > 0) {
      try {
        pack = addPublicTemplatesToPack(ownedPack, publicTemplates);
      } catch {
        throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
      }
    }
  }

  const summary = readSummary(pack);
  if (summary.exported > 0) {
    dependencies.download(pack as PortableTemplatePack);
  }
  return summary;
};
