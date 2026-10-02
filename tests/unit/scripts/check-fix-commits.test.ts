import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FIX_WITHOUT_A_TEST_MESSAGE, fixCommitsWithoutATest, isFixSubject, isTestFile } from '../../../scripts/lib/fix-commits';
import { buildScriptInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const CHECK = path.join(REPO_ROOT, 'scripts/check-fix-commits.ts');
const env = throwawayRepositoryEnvironment();
const workDir = mkdtempSync(path.join(tmpdir(), 'check-fix-commits-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

let repositories = 0;
function aRepository(): string {
  repositories += 1;
  const repository = path.join(workDir, `repository-${repositories}`);
  mkdirSync(repository);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, env, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Throwaway Test');
  git('config', 'user.email', 'throwaway@example.test');
  writeFileSync(path.join(repository, 'README.md'), 'start\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: start');
  return repository;
}

function commit(repository: string, subject: string, files: string[]): void {
  for (const file of files) {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), `${subject}\n`);
  }
  execFileSync('git', ['add', ...files], { cwd: repository, env });
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: repository, env });
}

function runCheck(repository: string, args: string[]) {
  const { command, args: invocationArgs } = buildScriptInvocation(CHECK, args);
  const result = spawnSync(command, invocationArgs, { cwd: repository, env, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('which commits the rule covers', () => {
  it('treats a Conventional Commits fix, with or without a scope or breaking mark, as a fix', () => {
    expect(['fix: a', 'fix(api): a', 'fix!: a', 'Fix: a'].map(isFixSubject)).toEqual([true, true, true, true]);
    expect(['fixes: a', 'refactor: fix a', 'feat: a', 'test(fix): a'].map(isFixSubject)).toEqual([false, false, false, false]);
  });

  it('counts files under tests/ and test or spec files beside the code as tests', () => {
    expect(['tests/unit/a.test.ts', 'tests/e2e/a.spec.ts', 'tests/support/a.ts', 'src/lib/a.test.tsx', 'src\\lib\\b.spec.mjs'].map(isTestFile)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['src/lib/a.ts', 'docs/testing.md', 'scripts/test-helpers.ts'].map(isTestFile)).toEqual([false, false, false]);
  });

  it('lists only the fix commits that change no test', () => {
    const commits = [
      { sha: 'a', subject: 'fix: no test', files: ['src/a.ts'] },
      { sha: 'b', subject: 'fix: with a test', files: ['src/b.ts', 'tests/unit/b.test.ts'] },
      { sha: 'c', subject: 'refactor: no test needed', files: ['src/c.ts'] },
    ];
    expect(fixCommitsWithoutATest(commits).map(({ sha }) => sha)).toEqual(['a']);
  });
});

describe('pnpm CI: check-fix-commits --range', { timeout: 60_000 }, () => {
  it('fails on a fix commit in the range that changes no test, and names it', () => {
    const repository = aRepository();
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, env, encoding: 'utf8' }).trim();
    commit(repository, 'fix: avatar falls back to the default icon', ['src/avatar.ts']);
    commit(repository, 'fix: share link with its regression test', ['src/share.ts', 'tests/unit/share.test.ts']);
    commit(repository, 'refactor: rename a helper', ['src/helper.ts']);

    const { status, output } = runCheck(repository, ['--range', `${base}..HEAD`]);

    expect(status).toBe(1);
    expect(output).toContain('fix: avatar falls back to the default icon');
    expect(output).not.toContain('fix: share link');
    expect(output).toContain(FIX_WITHOUT_A_TEST_MESSAGE);
  });

  it('passes when every fix commit in the range changes a test', () => {
    const repository = aRepository();
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, env, encoding: 'utf8' }).trim();
    commit(repository, 'fix: with a test beside the code', ['src/a.ts', 'src/a.test.ts']);
    commit(repository, 'docs: explain it', ['docs/a.md']);

    expect(runCheck(repository, ['--range', `${base}..HEAD`]).status).toBe(0);
  });
});

describe('the commit-msg hook: check-fix-commits --commit-msg', { timeout: 60_000 }, () => {
  const staged = (repository: string, files: string[], message: string) => {
    for (const file of files) {
      mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
      writeFileSync(path.join(repository, file), 'change\n');
    }
    execFileSync('git', ['add', ...files], { cwd: repository, env });
    const messageFile = path.join(repository, '.git', 'COMMIT_EDITMSG');
    writeFileSync(messageFile, `${message}\n\nDetails.\n`);
    return runCheck(repository, ['--commit-msg', messageFile]);
  };

  it('refuses a fix commit whose staged files hold no test', () => {
    const { status, output } = staged(aRepository(), ['src/avatar.ts'], 'fix(avatar): show the uploaded image');

    expect(status).toBe(1);
    expect(output).toContain(FIX_WITHOUT_A_TEST_MESSAGE);
  });

  it('accepts a fix commit that stages a test, and any other commit type without one', () => {
    expect(staged(aRepository(), ['src/avatar.ts', 'tests/unit/avatar.test.ts'], 'fix: show the uploaded image').status).toBe(0);
    expect(staged(aRepository(), ['src/avatar.ts'], 'refactor: name the avatar loader').status).toBe(0);
  });
});

describe('where the rule runs', () => {
  it('checks each commit message in the Lefthook commit-msg hook', () => {
    const hooks = z
      .object({ 'commit-msg': z.object({ commands: z.record(z.object({ run: z.string() })) }) })
      .parse(parse(readFileSync(path.join(REPO_ROOT, 'lefthook.yml'), 'utf8')));

    expect(Object.values(hooks['commit-msg'].commands).map(({ run }) => run)).toContain(
      'node --import tsx scripts/check-fix-commits.ts --commit-msg {1}',
    );
  });

  it("checks every commit of a pull request in CI's Quality Gate, with the history it needs", () => {
    const quality = z
      .object({ jobs: z.object({ quality: z.object({ steps: z.array(workflowStepSchema) }) }) })
      .parse(readWorkflowFile(path.join(REPO_ROOT, '.github/workflows/ci.yml'))).jobs.quality;
    const checkout = quality.steps.find((step) => step.uses?.startsWith('actions/checkout'));
    const fixCheck = quality.steps.find((step) => step.run?.includes('scripts/check-fix-commits.ts --range'));

    expect(checkout?.with?.['fetch-depth']).toBe(0);
    expect(fixCheck?.if).toBe("github.event_name == 'pull_request'");
    expect(fixCheck?.env?.['FIX_COMMIT_RANGE']).toBe('origin/${{ github.base_ref }}..${{ github.event.pull_request.head.sha }}');
  });
});
