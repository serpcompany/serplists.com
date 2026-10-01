import type { PortableTemplatePack } from '@/lib/schemas/checklistSchema';
import { formatExportSummaryMessage } from '@/lib/templates/templateImportSummary';
import {
  downloadBackupFile,
  exportPortableTemplatesToJSON,
} from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

import type { TemplateDetailBillingState } from './useTemplateDetailModel';

const WINDOWS_RESERVED_FILENAME_CHARACTERS = '\\/:*?"<>|';

const FIRST_PRINTABLE_CHARACTER_CODE = 32;

const isUnsafeFilenameCharacter = (character: string): boolean =>
  character.charCodeAt(0) < FIRST_PRINTABLE_CHARACTER_CODE ||
  WINDOWS_RESERVED_FILENAME_CHARACTERS.includes(character);

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
