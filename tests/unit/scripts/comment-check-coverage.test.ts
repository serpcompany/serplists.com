import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

import {
  checkedLanguage,
  commentCheckOf,
  filesGitTracksOrWouldTrack,
} from '../../../scripts/check-no-comments-lib';
import { buildScriptInvocation } from '../../../scripts/lib/run-tool';
import { isError, rulesFor } from '../../support/eslintConfig';

const repositoryFiles: string[] = filesGitTracksOrWouldTrack().filter((file: string) => existsSync(file));
const COMMENT_CHECK_COMMAND = 'node --import tsx scripts/check-no-comments.ts';

const packageScripts = z
  .object({ scripts: z.object({ 'check:repo': z.string() }).catchall(z.string()) })
  .parse(JSON.parse(readFileSync('package.json', 'utf8'))).scripts;
const preCommitCommands = z
  .object({ 'pre-commit': z.object({ commands: z.record(z.object({ glob: z.string().optional(), run: z.string() })) }) })
  .parse(parse(readFileSync('lefthook.yml', 'utf8')))['pre-commit'].commands;

const lefthookGlobPattern = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\{([^}]*)\}/g, (_braces, options: string) => `(?:${options.split(',').join('|')})`)}$`,
  );

describe('the comment checks', { timeout: 60_000 }, () => {
  it('cover every file the repository holds: by ESLint, check-no-comments, GENERATED_FILES, as Markdown, or as a format without comments', () => {
    expect(
      repositoryFiles.filter((file) => commentCheckOf(file) === null),
      'No comment check covers these files. Teach scripts/check-no-comments-lib.ts to read their format (FILE_LANGUAGES or ' +
        'DOTFILE_LANGUAGES, with its comment scanner in scripts/lib/comment-ranges.ts), list a file a generator writes in ' +
        'GENERATED_FILES, or add a format that has no comment syntax to FORMATS_WITHOUT_COMMENTS.',
    ).toEqual([]);
  });

  it('hold every TypeScript and JavaScript file to the ESLint no-comments rule', async () => {
    const eslint = new ESLint();
    const unchecked: string[] = [];
    for (const file of repositoryFiles.filter((path) => commentCheckOf(path) === 'ESLint')) {
      if (!isError((await rulesFor(eslint, file))['serplists/no-comments'])) unchecked.push(file);
    }

    expect(
      unchecked,
      'ESLint does not apply serplists/no-comments to these files. Take them out of the ignores of the no-comments block ' +
        'in eslint.config.ts (or of the global ignores) and remove their comments.',
    ).toEqual([]);
  });

  it('run in check:repo, and before each commit on the staged files of every format check-no-comments reads', () => {
    expect(packageScripts['comments:check']).toBe(COMMENT_CHECK_COMMAND);
    expect(packageScripts['check:repo'].split('&&').map((command) => command.trim())).toContain('pnpm run comments:check');

    const preCommit = Object.values(preCommitCommands).find(({ run }) => run === `${COMMENT_CHECK_COMMAND} {staged_files}`);
    expect(preCommit, `lefthook.yml needs a pre-commit command that runs "${COMMENT_CHECK_COMMAND} {staged_files}".`).toBeDefined();
    const staged = lefthookGlobPattern(preCommit?.glob ?? '*');
    expect(
      repositoryFiles.filter((file) => checkedLanguage(file) && !staged.test(file)),
      'The glob of the comment check in lefthook.yml misses these files, which check-no-comments reads. Add their format to it.',
    ).toEqual([]);
  });
});

describe('the comment check on workflows', () => {
  const workflows = repositoryFiles.filter((file) => file.startsWith('.github/workflows/'));

  it('reads every workflow, the Claude review and weekly maintenance workflows included', () => {
    expect(workflows).toEqual(
      expect.arrayContaining(['.github/workflows/claude-code-review.yml', '.github/workflows/maintenance.yml']),
    );
    expect(workflows.filter((file) => checkedLanguage(file) === null)).toEqual([]);
  });

  it('finds no comment in any workflow, and skips none of them', () => {
    const { command, args } = buildScriptInvocation('scripts/check-no-comments.ts', workflows);
    const result = spawnSync(command, args, { encoding: 'utf8' });

    expect(result.stdout).toContain(`check-no-comments: no comments in ${workflows.length} file(s).`);
    expect(result.status).toBe(0);
  });
});
