import { z } from 'zod';

import { api } from '@/lib/api';
import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';

// Only the fields the client relies on; the rest of the pack is downloaded unchanged.
const exportedPackSchema = z
  .object({ templates: z.array(z.unknown()) })
  .passthrough();

type ExportBackup = (params: { includePublic: boolean; teamId?: string }) => Promise<unknown>;

type ExportTemplatePackDependencies = {
  download: (pack: PortableTemplatePack) => void;
  exportBackup?: ExportBackup;
};

export type ExportTemplatePackResult =
  | { kind: 'empty' }
  | { kind: 'exported'; count: number };

const defaultExportBackup: ExportBackup = (params) => api.exportTemplateBackup(params);

/** Shown when the server answers with something that is not a template pack. */
export const EXPORT_PACK_UNREADABLE_MESSAGE = 'The export could not be read. Try again.';

/**
 * Exports the active context's Templates, plus public ones when asked. The server
 * builds the pack, so the page never needs the public catalog, and the count it
 * returns alone decides whether anything was exported: the page's own list may
 * still be loading, or look empty because its request failed.
 */
export const exportTemplatePack = async (
  options: { includePublic: boolean; teamId?: string },
  dependencies: ExportTemplatePackDependencies,
): Promise<ExportTemplatePackResult> => {
  const exportBackup = dependencies.exportBackup ?? defaultExportBackup;
  const response = await exportBackup({
    includePublic: options.includePublic,
    teamId: options.teamId,
  });
  const parsed = exportedPackSchema.safeParse(response);

  // The page toasts the error message as-is, so never throw the raw ZodError text.
  if (!parsed.success) {
    throw new Error(EXPORT_PACK_UNREADABLE_MESSAGE);
  }

  const pack = parsed.data;

  if (pack.templates.length === 0) {
    return { kind: 'empty' };
  }

  dependencies.download(pack as unknown as PortableTemplatePack);
  return { kind: 'exported', count: pack.templates.length };
};
