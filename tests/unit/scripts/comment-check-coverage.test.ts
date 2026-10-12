import { existsSync, readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

import { checkedLanguage, commentCheckOf, filesGitTracksOrWouldTrack } from '../../../scripts/check-no-comments-lib';
import { checkNames, perFileChecks } from '../../../scripts/checks/checks';
import { findCommentProblems } from '../../../scripts/checks/comments';
import { isError, rulesFor } from '../../support/eslintConfig';

const repoRoot = process.cwd();
const repositoryFiles: string[] = filesGitTracksOrWouldTrack().filter((file: string) => existsSync(file));

const preCommitCommands = z
  .object({ 'pre-commit': z.object({ commands: z.record(z.object({ glob: z.string().optional(), run: z.string() })) }) })
  .parse(parse(readFileSync('lefthook.yml', 'utf8')))['pre-commit'].commands;

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

  it('run in pnpm run verify, and before each commit on every staged file, whatever its format', () => {
    expect(checkNames).toContain('comments');
    expect(perFileChecks).toContain('comments');
    const preCommit = Object.values(preCommitCommands).find(({ run }) => run.startsWith('node --import tsx scripts/checks/cli.ts '));
    expect(preCommit?.run, 'lefthook.yml needs a pre-commit command that runs the per-file checks on {staged_files}.').toMatch(
      /^node --import tsx scripts\/checks\/cli\.ts \S*\bcomments\b\S* \{staged_files\}$/,
    );
    expect(preCommit?.glob, 'A glob on the pre-commit checks would let staged files of other formats through.').toBeUndefined();
  });
});

describe('the comment check on workflows', () => {
  const workflows = repositoryFiles.filter((file) => file.startsWith('.github/workflows/'));

  it('reads every workflow as YAML with shell and JavaScript run blocks', () => {
    expect(workflows).toEqual(expect.arrayContaining(['.github/workflows/ci.yml', '.github/workflows/maintenance.yml']));
    expect(workflows.filter((file) => checkedLanguage(file) !== 'yaml')).toEqual([]);
  });

  it('finds no comment in any workflow, and skips none of them', { timeout: 60_000 }, async () => {
    expect(await findCommentProblems(repoRoot, workflows)).toEqual([]);
  });
});
