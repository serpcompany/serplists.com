import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROMOTION_BODY_FILE } from '../../../scripts/promote-prepare-lib';
import { aGhStandIn, type GhAnswer } from '../../support/ghStandIn';
import { runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { theUtcDayAfter, utcDate, withTheDatesAround } from '../../support/utcDates';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('promote-prepare-cli-');
const env = throwawayRepositoryEnvironment({
  GIT_AUTHOR_NAME: 'Throwaway Test',
  GIT_AUTHOR_EMAIL: 'throwaway@example.test',
  GIT_COMMITTER_NAME: 'Throwaway Test',
  GIT_COMMITTER_EMAIL: 'throwaway@example.test',
});

function aCheckoutWithAThrowawayOrigin() {
  const folder = mkdtempSync(path.join(workDir, 'promotion-'));
  const origin = path.join(folder, 'origin.git');
  const checkout = path.join(folder, 'checkout');
  const git = (cwd: string, args: string[], input?: string) => execFileSync('git', args, { cwd, env, encoding: 'utf8', input }).trim();
  execFileSync('git', ['init', '--quiet', '--bare', origin], { env });
  execFileSync('git', ['init', '--quiet', checkout], { env });
  git(checkout, ['remote', 'add', 'origin', origin]);
  const originGit = (...args: string[]) => git(origin, args);
  const tree = (files: Record<string, string>) =>
    git(
      origin,
      ['mktree'],
      Object.entries(files)
        .map(([name, text]) => `100644 blob ${git(origin, ['hash-object', '-w', '--stdin'], text)}\t${name}\n`)
        .join(''),
    );
  const commit = (files: Record<string, string>, subject: string, parents: string[] = []) =>
    originGit('commit-tree', tree(files), ...parents.flatMap((parent) => ['-p', parent]), '-m', subject);
  const branches = (heads: { main: string; staging: string }) => {
    originGit('update-ref', 'refs/heads/main', heads.main);
    originGit('update-ref', 'refs/heads/staging', heads.staging);
  };
  const promote = (args: string[] = ['--dry-run'], ghAnswers: Record<string, GhAnswer> = {}) =>
    runRepositoryScriptWhileServing('scripts/promote-prepare.ts', args, {
      cwd: checkout,
      env: { ...env, PATH: aGhStandIn(path.join(folder, 'bin'), checkout, ghAnswers) },
    });
  return { checkout, originGit, commit, branches, promote };
}

const pullRequest = (number: number, body: string): Record<string, GhAnswer> => ({
  [`repos/{owner}/{repo}/pulls/${number}`]: { status: 0, stdout: `${body}\n` },
});

describe('pnpm run promote:prepare against a throwaway origin', { timeout: 60_000 }, () => {
  it("writes the promotion PR's body with the issues the promoted pull requests close, and on a dry run pushes nothing", async () => {
    const { checkout, originGit, commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change (#1)');
    const staging = commit({ 'README.md': 'three' }, 'fix: the third change (#3)', [commit({ 'README.md': 'two' }, 'feat: the second change (#2)', [promoted])]);
    branches({ main: commit({ 'README.md': 'one' }, 'chore: promote staging to main (#4)'), staging });

    const { result, dates } = await withTheDatesAround(() =>
      promote(['--dry-run'], { ...pullRequest(2, 'Closes #20\n\n## Why'), ...pullRequest(3, 'Closes #30\r\nCloses #20') }),
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(checkout, PROMOTION_BODY_FILE), 'utf8').split('\n').slice(0, 4)).toEqual([
      'Closes #20',
      'Closes #30',
      '',
      `Promotes staging ${staging.slice(0, 7)} to main, with #2, #3.`,
    ]);
    expect(result.stdout).toContain(`Dry run: would push `);
    expect(result.stdout).toMatch(new RegExp(`to promote/staging-(?:${dates.join('|')})-${staging.slice(0, 7)}\\.`));
    expect(originGit('for-each-ref', '--format=%(refname)', 'refs/heads/promote')).toBe('');
  });

  it('stops, naming the pull request and how to sign in, when gh cannot read a promoted pull request', async () => {
    const { checkout, commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change');
    branches({ main: commit({ 'README.md': 'one' }, 'chore: promote'), staging: commit({ 'README.md': 'two' }, 'feat: the second change (#7)', [promoted]) });

    const result = await promote();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('gh could not read pull request #7, whose Closes lines the promotion carries to main. Sign in with gh auth login, then run this again.');
    expect(existsSync(path.join(checkout, PROMOTION_BODY_FILE))).toBe(false);
  });

  it('says there is nothing to promote when main already has the files on staging', async () => {
    const { commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    branches({ main: commit({ 'README.md': 'same' }, 'chore: main'), staging: commit({ 'README.md': 'same' }, 'chore: staging') });

    const result = await promote();

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("main already has staging's files; there is nothing to promote.");
  });

  it('refuses while main holds a hotfix staging lacks, listing the files it changed', async () => {
    const { commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promotion = commit({ 'README.md': 'one' }, 'chore: promote staging to main (#4)');
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change (#1)');
    branches({
      main: commit({ 'README.md': 'one', 'hotfix.ts': 'fixed' }, 'fix: a hotfix on main (#5)', [promotion]),
      staging: commit({ 'README.md': 'two' }, 'feat: the second change (#2)', [promoted]),
    });

    const result = await promote();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('main has changes that are not in staging (for example a hotfix). Bring them into\nstaging through a normal PR first');
    expect(result.stderr).toContain('Files changed on main:\nhotfix.ts');
  });

  it('refuses when main never had any of the files staging has had', async () => {
    const { commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    branches({ main: commit({ 'README.md': 'elsewhere' }, 'chore: start main'), staging: commit({ 'README.md': 'two' }, 'feat: staging') });

    const result = await promote();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Files changed on main:\n(no earlier promotion found)');
  });

  it('promotes once a hotfix on main has been merged back into staging', async () => {
    const { commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promotion = commit({ 'README.md': 'one' }, 'chore: promote staging to main (#4)');
    const hotfix = commit({ 'README.md': 'one', 'hotfix.ts': 'fixed' }, 'fix: a hotfix on main (#5)', [promotion]);
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change');
    const mergedBack = commit({ 'README.md': 'one', 'hotfix.ts': 'fixed' }, "Merge branch 'main' into staging", [promoted, hotfix]);
    branches({ main: hotfix, staging: commit({ 'README.md': 'two', 'hotfix.ts': 'fixed' }, 'feat: the second change', [mergedBack]) });

    const result = await promote();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No issue: none of the promoted pull requests closes one.');
    expect(result.stdout).toContain('Dry run: would push');
  });

  it('points at the promotion branch already on origin for this staging commit instead of pushing another', async () => {
    const { originGit, commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change');
    const staging = commit({ 'README.md': 'two' }, 'feat: the second change', [promoted]);
    branches({ main: commit({ 'README.md': 'one' }, 'chore: promote'), staging });
    const today = utcDate();
    const promotionBranches = [today, theUtcDayAfter(today)].map((date) => `promote/staging-${date}-${staging.slice(0, 7)}`);
    for (const branch of promotionBranches) originGit('update-ref', `refs/heads/${branch}`, staging);

    const result = await promote([]);
    const pointedAt = promotionBranches.filter((branch) => result.stdout.includes(`${branch} already exists for staging ${staging.slice(0, 7)}. Open the promotion PR:`));

    expect(result.status).toBe(0);
    expect(pointedAt).toHaveLength(1);
    expect(result.stdout).toContain(`gh pr create --base main --head ${pointedAt.join('')}`);
    expect(originGit('for-each-ref', '--format=%(objectname)', 'refs/heads/promote')).toBe(`${staging}\n${staging}`);
  });

  it("pushes staging's files to a new promotion branch on origin, with main recorded as merged, and says how to open the pull request", async () => {
    const { originGit, commit, branches, promote } = aCheckoutWithAThrowawayOrigin();
    const promoted = commit({ 'README.md': 'one' }, 'feat: the first change');
    const staging = commit({ 'README.md': 'two' }, 'feat: the second change', [promoted]);
    const main = commit({ 'README.md': 'one' }, 'chore: promote');
    branches({ main, staging });

    const { result, dates } = await withTheDatesAround(() => promote([]));
    const pushed = originGit('for-each-ref', '--format=%(refname:short)', 'refs/heads/promote');

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(dates.map((date) => `promote/staging-${date}-${staging.slice(0, 7)}`)).toContain(pushed);
    expect(originGit('rev-parse', `${pushed}^{tree}`)).toBe(originGit('rev-parse', `${staging}^{tree}`));
    expect(originGit('rev-list', '--parents', '-n', '1', pushed).split(' ').slice(1)).toEqual([staging, main]);
    expect(result.stdout).toContain(
      `Pushed ${pushed}: staging ${staging.slice(0, 7)} with main ${main.slice(0, 7)} recorded as merged.\n` +
        `Open the promotion PR:\n  gh pr create --base main --head ${pushed} --title "chore: promote staging ${staging.slice(0, 7)} to main" ` +
        `--body-file ${PROMOTION_BODY_FILE}\n`,
    );
  });
});
