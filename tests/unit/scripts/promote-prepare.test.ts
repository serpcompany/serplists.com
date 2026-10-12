import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

import { type Git, issuesClosedBy, promotionBody, pullRequestOf, stagingSubjectsSinceTheLastPromotion } from '../../../scripts/promote-prepare';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const STAGING = '07ec182950550883a30578a6e5b50658f1134ed7';

describe('the pull request a commit on staging came from', () => {
  it.each([
    ['feat: the production Worker serves serplists.com (#297)', 297],
    ['Merge pull request #45 from serpcompany/fl/promotion-checks', 45],
    ['chore: pushed straight to staging', null],
    ['fix: (#12) is not where GitHub puts the number', null],
  ])('reads "%s" as %s', (subject, pullRequest) => {
    expect(pullRequestOf(subject)).toBe(pullRequest);
  });
});

describe('the issues a pull request closes', () => {
  it('reads every line that says Closes #<number>, and nothing that only mentions an issue', () => {
    const body = 'Closes #12\r\nCloses #13\n\n## Why\n  closes #14  \nPart of #15\nRefs #16\nCloses #17 and #18\nThis closes #19.';

    expect(issuesClosedBy(body)).toEqual([12, 13, 14]);
  });
});

describe("the promotion pull request's body", () => {
  const bodies: Record<number, string> = {
    296: 'Closes #290\nCloses #288\n\n## Why',
    297: 'Closes #290\n\n## Why',
    298: 'No issue: a typo',
  };
  const bodyOf = (pullRequest: number) => bodies[pullRequest] ?? '';

  it('starts with one Closes line for each issue the promoted pull requests closed, so merging it into main closes them', () => {
    const subjects = ['feat: the third change (#297)', 'chore: pushed straight to staging', 'fix: the first change (#296)', 'docs: a typo (#298)'];

    expect(promotionBody(STAGING, subjects, bodyOf).split('\n')).toEqual([
      'Closes #288',
      'Closes #290',
      '',
      'Promotes staging 07ec182 to main, with #296, #297, #298.',
      '',
      "Squash-merge this PR. A rebase merge would replay staging's history onto main, and",
      'merge commits are not allowed.',
      '',
    ]);
  });

  it('says there is no issue when none of the promoted pull requests closes one', () => {
    const body = promotionBody(STAGING, ['docs: a typo (#298)'], bodyOf);

    expect(body.split('\n')[0]).toBe('No issue: none of the promoted pull requests closes one.');
  });
});

describe('the commits staging has had since the last promotion', () => {
  const repository = aWorkDirRemovedAfterAll('promote-prepare-');
  const env = throwawayRepositoryEnvironment({
    GIT_AUTHOR_NAME: 'Throwaway Test',
    GIT_AUTHOR_EMAIL: 'throwaway@example.test',
    GIT_COMMITTER_NAME: 'Throwaway Test',
    GIT_COMMITTER_EMAIL: 'throwaway@example.test',
  });
  const run = (args: string[], input?: string) => execFileSync('git', args, { cwd: repository, env, encoding: 'utf8', input }).trim();
  const git: Git = (...args) => run(args);
  const files = (text: string) => run(['mktree'], `100644 blob ${run(['hash-object', '-w', '--stdin'], text)}\tREADME.md\n`);
  const commit = (text: string, subject: string, parents: string[] = []) =>
    git('commit-tree', files(text), ...parents.flatMap((parent) => ['-p', parent]), '-m', subject);
  const history = { hotfix: '', unrelated: '' };

  beforeAll(() => {
    git('init', '--quiet');
    const promoted = commit('one', 'feat: the first change (#1)');
    const second = commit('two', 'fix: the second change (#2)', [promoted]);
    history.hotfix = commit('hotfix', 'fix: a hotfix on main (#5)', [commit('one', 'chore: promote staging to main (#4)')]);
    const mergedBack = commit('three', "Merge branch 'main' into staging", [second, history.hotfix]);
    git('update-ref', 'refs/remotes/origin/staging', commit('four', 'feat: the third change (#3)', [mergedBack]));
    history.unrelated = commit('elsewhere', 'chore: start main');
  });

  it("lists staging's own commits after the last one whose files main was given, newest first, through a hotfix merged back", () => {
    git('update-ref', 'refs/remotes/origin/main', history.hotfix);

    expect(stagingSubjectsSinceTheLastPromotion(git)).toEqual([
      'feat: the third change (#3)',
      "Merge branch 'main' into staging",
      'fix: the second change (#2)',
    ]);
  });

  it('lists every commit staging has had when main never had its files', () => {
    git('update-ref', 'refs/remotes/origin/main', history.unrelated);

    expect(stagingSubjectsSinceTheLastPromotion(git)).toHaveLength(4);
  });
});
