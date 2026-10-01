import { describe, expect, it } from 'vitest';

import foundationalChecklists from '@/data/public-template-packs/foundational-checklists.json';

import { pathsOfLiteralBackslashN } from '../../support/literalBackslashN';

describe('bundled public template packs', () => {
  it('store real line breaks, never a literal backslash-n, which code and Windows paths would then show', () => {
    expect(pathsOfLiteralBackslashN(foundationalChecklists, 'pack')).toEqual([]);
  });
});
