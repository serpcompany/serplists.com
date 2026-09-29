import { z } from 'zod';

import { api } from '@/lib/api';
import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';
import { addPublicTemplatesToPack, selectPublicTemplatesForExport } from '@/lib/templates/portableExport';
import { getExportSummary, type PortableExportSummary } from '@/lib/templates/templateImportSummary';
import type { ChecklistTemplate } from '@/types/checklist';

// Only the fields the client relies on; the rest of the pack is downloaded unchanged.
const exportedPackSchema = z
  .object({ templates: z.array(z.unknown()) })
  .passthrough();

// The slugs of the templates the server exported. A template without one is skipped.
const exportedSlugSchema = z.object({ slug: z.string().min(1) }).passthrough();
const readExportedSlugs = (templates: unknown[]): string[] =>
  templates.flatMap((template) => {
    const parsed = exportedSlugSchema.safeParse(template);
    return parsed.success ? [parsed.data.slug] : [];
  });

type ExportBackup = (params: { teamId?: string }) => Promise<unknown>;
type LoadPublicCatalog = () => Promise<ChecklistTemplate[]>;

type ExportTemplatePackDependencies = {
  download: (pack: PortableTemplatePack) => void;
  exportBackup?: ExportBackup;
  // The public catalog (edge cached), loaded only when public templates are included.
  loadPublicCatalog?: LoadPublicCatalog;
};

export type ExportTemplatePackOptions = {
  includePublic: boolean;
  teamId?: string;
  userId?: string;
  // The active context's own templates, which the server already exported.
  ownedTemplateIds?: Iterable<string>;
};

// How many templates the downloaded pack holds and which ones it left out.
export type ExportTemplatePackResult = PortableExportSummary;

const defaultExportBackup: ExportBackup = (params) => api.exportTemplateBackup(params);

/** Shown when the server answers with something that is not a template pack. */
export const EXPORT_PACK_UNREADABLE_MESSAGE = 'The export could not be read. Try again.';

const readSummary = (pack: unknown): PortableExportSummary => {
  try {
    return getExportSummary(pack);
  } catch {
    // The page toasts the error message as-is, so never throw the raw ZodError text.
    throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
  }
};

/**
 * Exports the active context's Templates, plus public ones when asked. The server exports
 * only the context's own templates, so an export never reads every public template from
 * D1; public ones come from the edge-cached catalog, which this page loads only for an
 * export that includes them. The pack alone decides whether anything was exported: the
 * page's own list may still be loading, or look empty because its request failed.
 */
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
      // The page's list may be missing some of them; the server's pack is not.
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
