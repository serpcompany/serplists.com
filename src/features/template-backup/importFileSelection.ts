import { formatValidationError } from '@/lib/schemas/formatValidationError';
import type { TemplateImportResult } from '@/lib/utils/templateBackup';

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.md', '.markdown', '.yaml', '.yml'];

export type ImportPreview = TemplateImportResult & { fileName: string };

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
  resetPreview: () => void;
  setBusy: (busy: boolean) => void;
};

export const selectImportFile = async (
  input: ImportFileInput,
  handlers: ImportFileSelectionHandlers,
): Promise<void> => {
  const file = input.files?.[0];
  if (!file) return;

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
