import { describe, expect, it } from 'vitest';

import { firstOf, onlyElement } from '../../support/elements';
import { groupFindings, isRepeated, partOf, readFindings, titleOf } from '../../../scripts/lib/review-findings';

const finding = (path: string, pull: number, body = '**blocking** The email is logged.') => ({
  path,
  body,
  url: `https://github.com/o/r/pull/${pull}#discussion_r${pull}${path.length}`,
  pull,
});

describe('review findings', () => {
  it('are grouped by the part of the repository their file is in', () => {
    expect(partOf('functions/api/handlers/templates.ts')).toBe('functions/api');
    expect(partOf('src/components/ui/button.tsx')).toBe('src/components');
    expect(partOf('tests/e2e/templates.spec.ts')).toBe('tests/e2e');
    expect(partOf('docs/agents/ci-agents.md')).toBe('docs/agents');
    expect(partOf('docs/quality.md')).toBe('docs/quality');
    expect(partOf('.github/workflows/code-review.yml')).toBe('.github/workflows');
    expect(partOf('scripts/lib/review-findings.ts')).toBe('scripts');
    expect(partOf('AGENTS.md')).toBe('AGENTS.md');
  });

  it('are titled by their first line, without the marks around it', () => {
    expect(titleOf('**blocking** **The email is logged.**\n\nIt reaches Workers Logs.')).toBe('The email is logged.');
    expect(titleOf('\n**suggestion**: name [the helper] for what it does')).toBe('name the helper for what it does');
    expect(titleOf(`**${'x'.repeat(200)}**`)).toHaveLength(100);
  });

  it('count pull requests and blocking findings in each part, the most widespread first', () => {
    const groups = groupFindings([
      finding('functions/api/handlers/a.ts', 7),
      finding('functions/api/utils/b.ts', 7, '**suggestion** Name it for what it does.'),
      finding('functions/api/handlers/c.ts', 9),
      finding('src/views/Pricing.tsx', 9),
      finding('scripts/lint.ts', 12, 'Blocking: exits 0 on a failure.'),
    ]);

    expect(groups.map(({ part, findings, pulls, blocking }) => [part, findings, pulls, blocking])).toEqual([
      ['functions/api', 3, 2, 2],
      ['scripts', 1, 1, 1],
      ['src/views', 1, 1, 1],
    ]);
    expect(firstOf(groups).examples).toEqual([
      { title: 'The email is logged.', url: 'https://github.com/o/r/pull/7#discussion_r727' },
      { title: 'Name it for what it does.', url: 'https://github.com/o/r/pull/7#discussion_r724' },
      { title: 'The email is logged.', url: 'https://github.com/o/r/pull/9#discussion_r927' },
    ]);
    expect(groups.map(isRepeated)).toEqual([true, false, false]);
  });

  it('three findings in one pull request are not a pattern yet', () => {
    const group = onlyElement(groupFindings([1, 2, 3].map(() => finding('src/views/Pricing.tsx', 7))));

    expect(isRepeated(group)).toBe(false);
  });

  it('are read only when they have the shape the report needs', () => {
    expect(readFindings({ message: 'Not Found' })).toEqual([]);
    expect(readFindings([finding('a.ts', 1), { path: 'b.ts' }, null, { ...finding('c.ts', 2), pull: '2' }])).toEqual([finding('a.ts', 1)]);
  });
});
