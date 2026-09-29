import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';
import { formatExportSummaryMessage } from '@/lib/templates/templateImportSummary';
import {
  downloadBackupFile,
  exportPortableTemplatesToJSON,
} from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

import type { TemplateDetailBillingState } from './useTemplateDetailModel';

// Path separators and characters Windows reserves in file names.
const RESERVED_FILENAME_CHARACTERS = '\\/:*?"<>|';

const isUnsafeFilenameCharacter = (character: string): boolean =>
  character.charCodeAt(0) < 32 || RESERVED_FILENAME_CHARACTERS.includes(character);

// A missing slug is mapped to '', so fall back to the id on any blank slug.
export const buildTemplateExportFilename = (template: ChecklistTemplate): string => {
  const base = (template.slug ?? '').trim() || template.id.trim();
  const safeBase = Array.from(base, (character) =>
    isUnsafeFilenameCharacter(character) ? '-' : character,
  )
    .join('')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return `${safeBase || 'template'}.json`;
};

// The portable pack is the format Import Templates and POST /api/templates/backup accept.
export const buildTemplateExportFile = (
  template: ChecklistTemplate,
): { filename: string; pack: PortableTemplatePack } => ({
  filename: buildTemplateExportFilename(template),
  pack: exportPortableTemplatesToJSON([template]),
});

export type TemplateExportResult =
  | { kind: 'ok'; assetWarnings: number }
  | { kind: 'upgrade_required' }
  | { kind: 'error'; message: string };

// Template export is a paid feature (docs/product-specs/portable-templates.md),
// decided by the active ownership context's plan, like Import Templates. The pack is
// built in the browser, so no server check can decide for it: a failed plan check asks
// for a retry, never an upgrade, because it is not the Free plan.
export const exportTemplateFile = (params: {
  billingState: TemplateDetailBillingState;
  download?: (pack: PortableTemplatePack, filename: string) => void;
  template: ChecklistTemplate | null;
}): TemplateExportResult => {
  if (!params.template) {
    return { kind: 'error', message: 'Template not found.' };
  }

  if (params.billingState.isLoading) {
    return { kind: 'error', message: 'Checking your plan. Try again in a moment.' };
  }

  if (params.billingState.isError) {
    return { kind: 'error', message: "Couldn't check your plan. Try again." };
  }

  if (!params.billingState.isPro) {
    return { kind: 'upgrade_required' };
  }

  const { filename, pack } = buildTemplateExportFile(params.template);
  // A template the portable format cannot hold is left out: say why, never download an empty pack.
  if (pack.templates.length === 0) {
    const skipped = pack.manifest?.skippedTemplates ?? [];
    return { kind: 'error', message: formatExportSummaryMessage({ exported: 0, skipped }).message };
  }
  (params.download ?? downloadBackupFile)(pack, filename);

  return { kind: 'ok', assetWarnings: pack.manifest?.assetWarnings ?? 0 };
};

export const getTemplateExportLabel = (
  billingState: TemplateDetailBillingState,
): string => {
  if (billingState.isLoading) {
    return 'Checking plan...';
  }

  return billingState.isPro || billingState.isError ? 'Export JSON' : 'Upgrade to export';
};
