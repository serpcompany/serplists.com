import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { firstOf } from '../../support/elements';
import { parse } from 'yaml';
import { z } from 'zod';

import {
  checkedLanguage,
  commentCheckOf,
  filesGitTracksOrWouldTrack,
  findComments,
  WORKFLOWS_AWAITING_A_PERSON,
} from '../../../scripts/check-no-comments-lib.mjs';

const repositoryFiles: string[] = filesGitTracksOrWouldTrack().filter((file: string) => existsSync(file));
const COMMENT_CHECK_COMMAND = 'node scripts/check-no-comments.mjs';

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
      'No comment check covers these files. Teach scripts/check-no-comments-lib.mjs to read their format (FILE_LANGUAGES or ' +
        'DOTFILE_LANGUAGES, with its comment scanner in scripts/lib/comment-ranges.mjs), list a file a generator writes in ' +
        'GENERATED_FILES, or add a format that has no comment syntax to FORMATS_WITHOUT_COMMENTS.',
    ).toEqual([]);
  });

  it('hold every TypeScript and JavaScript file to the ESLint no-comments rule', async () => {
    const eslint = new ESLint();
    const unchecked: string[] = [];
    for (const file of repositoryFiles.filter((path) => commentCheckOf(path) === 'ESLint')) {
      const rule = (await eslint.calculateConfigForFile(file))?.rules?.['serplists/no-comments'];
      if (!Array.isArray(rule) || rule[0] !== 2) unchecked.push(file);
    }

    expect(
      unchecked,
      'ESLint does not apply serplists/no-comments to these files. Take them out of the ignores of the no-comments block ' +
        'in eslint.config.js (or of the global ignores) and remove their comments.',
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

describe('WORKFLOWS_AWAITING_A_PERSON', () => {
  it('lists only workflows that still have comments, so the list only shrinks', () => {
    for (const file of WORKFLOWS_AWAITING_A_PERSON) {
      expect(existsSync(file), `${file} is gone: take it out of WORKFLOWS_AWAITING_A_PERSON.`).toBe(true);
      expect(
        findComments(file, readFileSync(file, 'utf8')).length,
        `${file} has no comments left: take it out of WORKFLOWS_AWAITING_A_PERSON in scripts/check-no-comments-lib.mjs.`,
      ).toBeGreaterThan(0);
    }
  });

  it('leaves the listed workflows to a person and still checks the other files it is given', () => {
    const workflow = firstOf(WORKFLOWS_AWAITING_A_PERSON);
    const result = spawnSync(process.execPath, ['scripts/check-no-comments.mjs', workflow, 'lefthook.yml'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`check-no-comments: skipped ${workflow}, which a person must clean`);
    expect(result.stdout).toContain('check-no-comments: no comments in 1 file(s).');
  });
});
