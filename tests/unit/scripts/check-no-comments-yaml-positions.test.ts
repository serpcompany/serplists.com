import { describe, expect, it, vi } from 'vitest';

import { findComments } from '../../../scripts/check-no-comments-lib';

vi.mock('yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('yaml')>();
  return {
    ...actual,
    parseAllDocuments: (source: string) => {
      const parsed = actual.parseAllDocuments(source);
      for (const document of parsed) {
        actual.visit(document, {
          Pair(_key, pair) {
            if (actual.isScalar(pair.key) && pair.key.value === 'run' && actual.isScalar(pair.value)) pair.value.range = null;
          },
        });
      }
      return parsed;
    },
  };
});

describe('the comment check of a workflow whose YAML parser gives a run block no position', () => {
  it('refuses to check the run block rather than guessing which lines it holds', () => {
    const workflow = ['jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo checked', ''].join('\n');

    expect(() => findComments('.github/workflows/ci.yml', workflow)).toThrow('YAML could not be parsed: a run block has no position in the file.');
  });
});
