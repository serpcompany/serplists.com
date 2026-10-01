import { describe, expect, it, vi } from 'vitest';

import {
  MAX_IMPORT_FILE_BYTES,
  selectImportFile,
  validateImportFile,
} from '@/features/template-backup/importFileSelection';
import type { TemplateImportResult } from '@/lib/utils/templateBackup';

const parsed: TemplateImportResult = { templates: [], warnings: [] };

const fileOf = (name: string, size = 10): File => {
  const file = new File(['{}'], name, { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const inputWith = (file?: File) => ({
  files: file ? [file] : [],
  value: file ? `C:\fakepath\${file.name}` : '',
});

const handlersFor = (parse: (file: File) => Promise<TemplateImportResult>) => ({
  onError: vi.fn(),
  onPreview: vi.fn(),
  parse: vi.fn(parse),
  resetPreview: vi.fn(),
  setBusy: vi.fn(),
});

describe('validateImportFile', () => {
  it('accepts the supported template formats up to 2MB', () => {
    for (const name of ['a.json', 'a.md', 'a.markdown', 'a.YAML', 'a.yml']) {
      expect(validateImportFile(fileOf(name))).toBeNull();
    }
    expect(validateImportFile(fileOf('a.json', MAX_IMPORT_FILE_BYTES))).toBeNull();
  });

  it('rejects other file types and files over 2MB', () => {
    expect(validateImportFile(fileOf('notes.txt'))).toBe('Please select a JSON, Markdown, or YAML template file');
    expect(validateImportFile(fileOf('b.json', MAX_IMPORT_FILE_BYTES + 1))).toBe('Import file too large (max 2MB)');
  });
});

describe('selectImportFile', () => {
  it('clears the previous preview when the next file is too large', async () => {
    const handlers = handlersFor(async () => parsed);
    await selectImportFile(inputWith(fileOf('a.json')), handlers);
    expect(handlers.onPreview).toHaveBeenCalledWith(parsed, 'a.json');

    const input = inputWith(fileOf('b.json', 3 * 1024 * 1024));
    await selectImportFile(input, handlers);

    expect(handlers.resetPreview).toHaveBeenCalledTimes(2);
    expect(handlers.onError).toHaveBeenCalledWith('Import file too large (max 2MB)');
    expect(handlers.parse).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('clears the previous preview when the next file has an unsupported type', async () => {
    const handlers = handlersFor(async () => parsed);
    const input = inputWith(fileOf('notes.txt'));

    await selectImportFile(input, handlers);

    expect(handlers.resetPreview).toHaveBeenCalledTimes(1);
    expect(handlers.onError).toHaveBeenCalledWith('Please select a JSON, Markdown, or YAML template file');
    expect(handlers.parse).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('clears the input after a parse failure so the fixed file can be chosen again', async () => {
    const file = fileOf('template.yaml');
    const handlers = handlersFor(async () => parsed);
    handlers.parse.mockRejectedValueOnce(new Error('Invalid YAML at line 3: bad indentation'));

    const firstInput = inputWith(file);
    await selectImportFile(firstInput, handlers);

    expect(firstInput.value).toBe('');
    expect(handlers.onError).toHaveBeenCalledWith('Failed to parse file: Invalid YAML at line 3: bad indentation');
    expect(handlers.onPreview).not.toHaveBeenCalled();
    expect(handlers.setBusy.mock.calls).toEqual([[true], [false]]);

    await selectImportFile(inputWith(file), handlers);

    expect(handlers.parse).toHaveBeenCalledTimes(2);
    expect(handlers.onPreview).toHaveBeenCalledWith(parsed, 'template.yaml');
  });

  it('clears the input after a successful preview too', async () => {
    const handlers = handlersFor(async () => parsed);
    const input = inputWith(fileOf('a.json'));

    await selectImportFile(input, handlers);

    expect(input.value).toBe('');
    expect(handlers.parse).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.json' }));
  });

  it("reads the chosen file and clears the input before its first await, since React clears the change event's currentTarget once the handler returns", () => {
    const handlers = handlersFor(async () => parsed);
    const input = inputWith(fileOf('a.json'));

    const selecting = selectImportFile(input, handlers);

    expect(input.value).toBe('');
    expect(handlers.resetPreview).toHaveBeenCalledTimes(1);
    expect(handlers.parse).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.json' }));
    return selecting;
  });

  it('keeps the current preview when the file dialog is dismissed', async () => {
    const handlers = handlersFor(async () => parsed);

    await selectImportFile(inputWith(), handlers);

    expect(handlers.resetPreview).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
