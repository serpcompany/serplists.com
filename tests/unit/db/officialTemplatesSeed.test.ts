import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { pathsOfLiteralBackslashN } from '../../support/literalBackslashN';

describe('bundled public template packs', () => {
  it('store real line breaks, never a literal backslash-n, which code and Windows paths would then show', () => {
    const pack: unknown = JSON.parse(
      readFileSync('src/data/public-template-packs/foundational-checklists.json', 'utf8'),
    );

    expect(pathsOfLiteralBackslashN(pack, 'pack')).toEqual([]);
  });
});
