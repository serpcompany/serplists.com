import { afterEach, describe, expect, it, vi } from 'vitest';

const markdownParser = vi.hoisted(() => ({ failure: null as unknown }));

vi.mock('@/lib/templates/templateMarkdown', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/templates/templateMarkdown')>();
  return {
    ...original,
    parseTemplateMarkdown: (source: string) => {
      if (markdownParser.failure !== null) throw markdownParser.failure;
      return original.parseTemplateMarkdown(source);
    },
  };
});

import { parseTemplatesFromFile } from '@/lib/utils/templateBackup';

class ReaderThatLoadsNoText {
  result: ArrayBuffer | null = new ArrayBuffer(4);
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText() {
    queueMicrotask(() => this.onload?.());
  }
}

afterEach(() => {
  markdownParser.failure = null;
  vi.unstubAllGlobals();
});

describe('a Template file the import cannot read', () => {
  it('says the file could not be read when the browser loads it as something other than text', async () => {
    vi.stubGlobal('FileReader', ReaderThatLoadsNoText);

    await expect(parseTemplatesFromFile(new File(['[]'], 'camping.json'))).rejects.toThrow('Failed to read file');
  });

  it('says the file could not be parsed when its parser fails with something that is not an error', async () => {
    markdownParser.failure = 'unexpected end of input';

    await expect(parseTemplatesFromFile(new File(['# Camping'], 'camping.md'))).rejects.toThrow(
      'Failed to parse template file',
    );
  });
});
