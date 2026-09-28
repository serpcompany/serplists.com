import { formatValidationError } from '@/lib/schemas/formatValidationError';
import type { TemplateImportResult } from '@/lib/utils/templateBackup';

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2MB
export const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.md', '.markdown', '.yaml', '.yml'];

/** A parsed file waiting for Confirm Import, with the name of the file it came from. */
export type ImportPreview = TemplateImportResult & { fileName: string };

/** Why a chosen file cannot be imported, or null when it can be parsed. */
export const validateImportFile = (file: Pick<File, 'name' | 'size'>): string | null => {
  const lowerName = file.name.toLowerCase();
  if (!SUPPORTED_IMPORT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    return 'Please select a JSON, Markdown, or YAML template file';
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return 'Import file too large (max 2MB)';
  }
  return null;
};

type ImportFileInput = {
  readonly files: ArrayLike<File> | null;
  value: string;
};

type ImportFileSelectionHandlers = {
  onError: (message: string) => void;
  onPreview: (result: TemplateImportResult, fileName: string) => void;
  parse: (file: File) => Promise<TemplateImportResult>;
  /** Drops the previous file's preview and the last import result. */
  resetPreview: () => void;
  setBusy: (busy: boolean) => void;
};

/**
 * Handles a change on the import file input. Every chosen file replaces the previous
 * preview, even one that is rejected, so Confirm Import never imports a file other
 * than the last one chosen. The input is cleared once the File is read, so choosing
 * the same path again (after fixing the file) still fires `change`. Read the input
 * from the event synchronously: React clears `currentTarget` after dispatch.
 */
export const selectImportFile = async (
  input: ImportFileInput,
  handlers: ImportFileSelectionHandlers,
): Promise<void> => {
  const file = input.files?.[0];
  if (!file) return; // The dialog was dismissed: keep the current preview.

  input.value = '';
  handlers.resetPreview();

  const rejection = validateImportFile(file);
  if (rejection) {
    handlers.onError(rejection);
    return;
  }

  handlers.setBusy(true);
  try {
    handlers.onPreview(await handlers.parse(file), file.name);
  } catch (error) {
    handlers.onError(`Failed to parse file: ${formatValidationError(error)}`);
  } finally {
    handlers.setBusy(false);
  }
};
