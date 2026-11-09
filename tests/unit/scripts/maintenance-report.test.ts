import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { knownLargeFiles } from '../../../scripts/checks/sizes';
import { aCopyOfTheCheckout } from '../../support/checkoutCopy';
import { runTheCopysScriptToTheEnd } from '../../support/checkoutCopyWithStandIns';
import { parseJsonText } from '../../support/storedJson';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { withTheDatesAround } from '../../support/utcDates';

const copy = aCopyOfTheCheckout({ asGitRepository: true });

afterAll(() => copy.remove());

const KEPT = new Set([
  'scripts',
  'tools',
  'package.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'knip.json',
  '.dependency-cruiser.cjs',
  '.jscpd.json',
  '.secretlintrc.json',
  'wrangler.toml',
  '.dev.vars.example',
  'cloudflare-env.d.ts',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.node-version',
]);

const GENERATOR_STAND_IN = 'stand-ins/generator-check.ts';

const git = (args: readonly string[], date?: string) =>
  execFileSync('git', args, {
    cwd: copy.root,
    encoding: 'utf8',
    env: throwawayRepositoryEnvironment({
      GIT_AUTHOR_NAME: 'Copy',
      GIT_AUTHOR_EMAIL: 'copy@example.test',
      GIT_COMMITTER_NAME: 'Copy',
      GIT_COMMITTER_EMAIL: 'copy@example.test',
      ...(date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    }),
  });

function write(files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(copy.root, file)), { recursive: true });
    writeFileSync(path.join(copy.root, file), text);
  }
}

function commitAt(date: string, files: Record<string, string>): void {
  write(files);
  git(['add', '-A']);
  git(['commit', '-q', '-m', `changes of ${date}`], date);
}

const table = (header: string, rows: readonly string[]) => [header, '| --- | --- | --- |', ...rows].join('\n');

const manifestSchema = z.object({ scripts: z.record(z.string()) }).passthrough();

function aRepositoryWithKnownDocs(): void {
  const tops = [...new Set(git(['ls-files']).split('\n').filter(Boolean).map((file) => file.split('/')[0] ?? file))];
  git(['rm', '-r', '-q', '--', ...tops.filter((top) => !KEPT.has(top))]);
  const manifest = parseJsonText(git(['show', 'HEAD:package.json']), manifestSchema);
  for (const check of ['schema:portable:check', 'db:schema:check', 'templates:check']) manifest.scripts[check] = `node --import tsx ${GENERATOR_STAND_IN}`;
  commitAt('2026-03-01T12:00:00Z', {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    [GENERATOR_STAND_IN]: 'process.exitCode = 0;\n',
    'scripts/planted-comment.ts': 'export const planted = 1; // the weekly report names this comment\n',
    'tools/near-limit.mjs': `${Array.from({ length: 460 }, (_, index) => `export const word${index} = "${(index * 7919).toString(36)}";`).join('\n')}\n`,
    'tools/notes.txt': 'first\n',
    'docs/agents/guide.md': '# Guide\n\nNotes live in `tools/notes.txt`; [the grades](../quality.md) name them too.\n',
    'docs/quality.md': `# Quality\n\n${table('| Area | Code | Graded |', ['| Notes | `tools/notes.txt` | 2026-03-15 |', '| Products | `docs/product/` | 2026-03-15 |', '| Drafts | `scripts/` | not yet |'])}\n`,
    'docs/tech-debt.md': `# Tech debt\n\n## Accounts\n\n${table('| Debt | Issue | Size |', ['| Sessions outlive a password change. Fix it in the auth handler. | #12 | medium |', '| Invites never expire. | #13 | small |'])}\n`,
    'docs/harness-debt.md': `# Harness debt\n\n## Checks\n\n${table('| Debt | Issue | Size |', ['| The size check reads no `.mjs.map` files. More later. | #14 | |'])}\n`,
    'docs/product/runs.md': '# Runs\n\n## Starting a run\n\n- Check: `tests/unit/runs.test.ts`\n- No automated check yet\n\n## Finishing a run\n\n- No automated check yet: needs a browser spec\n',
  });
  commitAt('2026-04-01T12:00:00Z', { 'tools/notes.txt': 'second\n' });
}

aRepositoryWithKnownDocs();

const report = () => withTheDatesAround(() => runTheCopysScriptToTheEnd(copy, 'scripts/maintenance-report.ts'));

const sectionOf = (text: string, heading: string) => text.split(`## ${heading}\n\n`)[1]?.split('\n## ')[0] ?? '';

describe('pnpm run maintenance:report in a repository whose docs it knows', { timeout: 300_000 }, () => {
  it("runs every repository check and reports the failing ones, the docs and grades to revisit, the known debt, and that it collected no review findings", async () => {
    const { result, dates } = await report();
    const text = result.stdout;

    expect(result.status).toBe(0);
    expect(dates.map((date) => `# Repository maintenance report\n\nGenerated ${date} by \`pnpm run maintenance:report\`.\n`)).toContain(text.slice(0, text.indexOf('\n## ')));
    expect(sectionOf(text, 'Checks')).toContain('`pnpm run verify comments` fails:\n\n````text\n');
    expect(sectionOf(text, 'Checks')).toContain('scripts/planted-comment.ts:1  export const planted = 1; // the weekly report names this comment\n');
    expect(sectionOf(text, 'Checks')).not.toContain('`pnpm run verify linters` fails');
    expect(sectionOf(text, 'Docs to re-verify')).toContain('- `docs/agents/guide.md`: `tools/notes.txt`\n- `docs/quality.md`: `tools/notes.txt`\n');
    expect(sectionOf(text, 'Scores to re-grade')).toContain(
      '- Notes (graded 2026-03-15): `tools/notes.txt` changed 2026-04-01\n- Rows without a Graded date, which each need one: Drafts.\n',
    );
    expect(sectionOf(text, 'Known debt')).toContain(
      [
        '- `docs/tech-debt.md` and `docs/harness-debt.md`: 3 open items (1 small, 1 medium, 0 large).',
        '- First small item: Accounts: Invites never expire. Issue: #13.',
        '- Rows without a Size, which each need one: 1.',
        '  - Checks: The size check reads no `.mjs.map` files. Issue: #14.',
        `- Files over the size limit, each with its reason in \`scripts/checks/sizes.ts\`: ${Object.keys(knownLargeFiles).length}.`,
      ].join('\n'),
    );
    expect(sectionOf(text, 'Files near the size limit')).toContain('- `tools/near-limit.mjs`: 460 lines');
    expect(sectionOf(text, 'Behaviors with no automated check')).toContain('2 behaviors in 1 doc. Write the test, then name it on the behavior\'s `- Check:` line.\n\n- `docs/product/runs.md`: lines 6, 10');
    expect(sectionOf(text, 'Review findings')).toContain('Not collected: only the `report` job of `Weekly maintenance` reads the pull requests\' comments.');
  });

  it('groups the review findings the report job collected by part, calling a part with three in two pull requests repeated', async () => {
    const pull = (number: number, comment: number) => `https://github.com/serpcompany/serplists.com/pull/${number}#discussion_r${comment}`;
    write({
      'tmp/review-findings.json': JSON.stringify([
        { path: 'scripts/dev-auto.ts', body: '**blocking** The session leaks.', url: pull(1, 1), pull: 1 },
        { path: 'scripts/dev-stop.ts', body: 'suggestion: Name the pid.', url: pull(2, 2), pull: 2 },
        { path: 'scripts/lib/run-tool.ts', body: 'Say why.', url: pull(2, 3), pull: 2 },
        { path: 'docs/agents/guide.md', body: 'A stale link.', url: pull(3, 4), pull: 3 },
        { path: 'docs/agents/guide.md', note: 'not a finding' },
      ]),
    });

    const { result } = await report();

    expect(result.status).toBe(0);
    expect(sectionOf(result.stdout, 'Review findings')).toContain(
      [
        'Repeated:',
        '',
        `- \`scripts\`: 3 in 2 pull requests, 1 blocking. [The session leaks.](${pull(1, 1)}); [Name the pid.](${pull(2, 2)}); [Say why.](${pull(2, 3)})`,
        '',
        'Elsewhere:',
        '',
        `- \`docs/agents\`: 1 in 1 pull request, 0 blocking. [A stale link.](${pull(3, 4)})`,
      ].join('\n'),
    );
  });
});
