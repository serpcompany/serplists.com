import { describe, expect, it } from 'vitest';

import { findDeadCode } from '../../../../scripts/checks/deadcode';
import { scratchRepository } from './scratch';

const project = (files: Readonly<Record<string, string>>) =>
  scratchRepository('deadcode', {
    'package.json': '{ "name": "scratch", "type": "module", "main": "src/index.ts" }\n',
    'src/index.ts': "import { used } from './used';\nexport const start = used;\n",
    'src/used.ts': 'export const used = 1;\n',
    ...files,
  });

describe('the dead code check', { timeout: 60_000 }, () => {
  it('fails an unused file and an unused export, from the entry points', () => {
    const report = findDeadCode(project({ 'src/used.ts': 'export const used = 1;\nexport const unused = 2;\n', 'src/orphan.ts': 'export const orphan = 3;\n' }));
    expect(report).toEqual(expect.arrayContaining(['src/orphan.ts', expect.stringMatching(/^unused\s+src\/used\.ts:2:14$/)]));
  });

  it('passes code that is all used', () => {
    expect(findDeadCode(project({}))).toEqual([]);
  });
});
