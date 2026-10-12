import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isTestFile } from '../../../scripts/lib/fix-commits';
import { runAgainstAGitHubStandIn, type Route } from '../../support/githubApiStandIn';
import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const REPOSITORY = 'serpcompany/serplists.com';
const SCRIPT = 'tools/checks/pull-request.mjs';
const ISSUES: Record<number, object> = { 12: { number: 12 }, 13: { number: 13 }, 296: { number: 296, pull_request: {} } };

type ChangedFile = { filename: string; status?: string };

const github =
  ({ files = [], refuse = false }: { files?: ChangedFile[]; refuse?: boolean } = {}): Route =>
  ({ path, query }) => {
    if (refuse) return { status: 403, body: { message: 'Resource not accessible by integration' } };
    const issue = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path)?.[1];
    if (issue !== undefined) return ISSUES[Number(issue)] ? { status: 200, body: ISSUES[Number(issue)] } : undefined;
    if (path !== `/repos/${REPOSITORY}/pulls/7/files`) return undefined;
    const page = Number(query.get('page') ?? '1');
    return { status: 200, body: files.slice((page - 1) * 100, page * 100).map((file) => ({ status: 'modified', ...file })) };
  };

const check = (name: string, env: Record<string, string>, api: Route = github()) =>
  runAgainstAGitHubStandIn({ script: SCRIPT, args: [name] }, { GITHUB_REPOSITORY: REPOSITORY, PR_NUMBER: '7', ...env }, api);

describe('the title check', () => {
  it.each(['fix: Escape closes the Settings window', 'feat(web): the kana charts open each kana', 'chore!: drop Node 20', 'ci: every workflow reads .node-version'])(
    'passes "%s"',
    async (title) => {
      const { status, requests } = await check('title', { PR_TITLE: title });

      expect(status).toBe(0);
      expect(requests).toEqual([]);
    },
  );

  it.each(['Promote staging: the production Worker serves serplists.com', 'fix:no space', 'fix: ', 'Fix: capitalised', 'bugfix: an unknown type'])(
    'fails "%s" and says what a title needs',
    async (title) => {
      const { status, output } = await check('title', { PR_TITLE: title });

      expect(status).toBe(1);
      expect(output).toContain(`::error::"${title}" is not a Conventional Commit.`);
      expect(output).toContain('Start it with one of feat, fix, perf, refactor, docs, test, build, ci, chore');
    },
  );

  it('reads the title as text, so a title that looks like a command runs nothing', async () => {
    const { status, output } = await check('title', { PR_TITLE: 'Say the stage; $(echo ran) `echo ran`' });

    expect(status).toBe(1);
    expect(output).toContain('"Say the stage; $(echo ran) `echo ran`"');
  });
});

describe('the issue-link check', () => {
  it('passes a body that starts with a Closes line per issue, after making sure each is an issue', async () => {
    const { status, output, requests } = await check('issue-link', { PR_BODY: '\r\nCloses #12\r\nCloses #13\r\n\r\n## Why\r\nCloses #99 here closes nothing' });

    expect(status).toBe(0);
    expect(output).toContain('Closes #12\nCloses #13');
    expect(requests.map((request) => request.path)).toEqual([`/repos/${REPOSITORY}/issues/12`, `/repos/${REPOSITORY}/issues/13`]);
  });

  it('passes a body whose first line says why there is no issue, without asking GitHub', async () => {
    const { status, output, requests } = await check('issue-link', { PR_BODY: 'No issue: a typo in a workflow name\n\n## Why' });

    expect(status).toBe(0);
    expect(output).toContain('No issue: a typo in a workflow name');
    expect(requests).toEqual([]);
  });

  it.each([
    ['an empty body', '', 'The body is empty.'],
    ["the template's empty line", 'Closes #\n\n## Why', 'The body starts with "Closes #".'],
    ['a line that closes nothing', 'Part of #12', 'The body starts with "Part of #12".'],
    ['a reason left out', 'No issue:\n', 'The body starts with "No issue:".'],
    ['a Closes line below other text', '## Why\nCloses #12', 'The body starts with "## Why".'],
  ])('fails %s without asking GitHub', async (_case, body, found) => {
    const { status, output, requests } = await check('issue-link', { PR_BODY: body });

    expect(status).toBe(1);
    expect(output).toContain(found);
    expect(output).toContain('Start the body with Closes #<number>, one line per issue');
    expect(requests).toEqual([]);
  });

  it.each([
    ['an issue that does not exist', 'Closes #12\nCloses #99', `#99 is not an issue in ${REPOSITORY}.`, false],
    ['a pull request', 'Closes #296', '#296 is a pull request, not an issue.', false],
    ['an issue GitHub would not show', 'Closes #12', 'GitHub answered 403 when asked for issue #12.', true],
  ])('fails a body that closes %s', async (_case, body, problem, refuse) => {
    const { status, output } = await check('issue-link', { PR_BODY: body }, github({ refuse }));

    expect(status).toBe(1);
    expect(output).toContain(problem);
  });

  it("exempts a promotion from this repository's own branch, whose merge into main closes what its pull requests closed", async () => {
    const promotion = { PR_BODY: 'Promotes staging 07ec182.', PR_BRANCH: 'promote/staging-2026-10-12-07ec182' };

    expect((await check('issue-link', { ...promotion, PR_HEAD_REPOSITORY: REPOSITORY })).status).toBe(0);
    expect((await check('issue-link', { ...promotion, PR_HEAD_REPOSITORY: 'someone/serplists.com' })).status).toBe(1);
  });
});

describe('the fix-test check', () => {
  it('passes a pull request that is not a fix without asking GitHub', async () => {
    const { status, requests } = await check('fix-test', { PR_TITLE: 'feat: fixes are listed', PR_BRANCH: 'issue-12-fixes' });

    expect(status).toBe(0);
    expect(requests).toEqual([]);
  });

  it.each([
    ['titled fix:', { PR_TITLE: 'fix(api)!: www reaches the apex in one hop', PR_BRANCH: 'issue-12-www' }],
    ['from a fix/ branch', { PR_TITLE: 'chore: tidy the redirect', PR_BRANCH: 'fix/12-www' }],
  ])('fails a pull request %s that changes no test, listing what it changes', async (_case, pullRequest) => {
    const files = [{ filename: 'next.config.ts' }, { filename: 'tests/unit/config/urlStandard.test.ts', status: 'removed' }];
    const { status, output } = await check('fix-test', pullRequest, github({ files }));

    expect(status).toBe(1);
    expect(output).toContain('Changes no test:\nnext.config.ts\n');
    expect(output).toContain('adds or changes the test that fails without the fix');
  });

  it('passes a fix whose test is on a later page of its files', async () => {
    const files = [...Array.from({ length: 100 }, (_, index) => ({ filename: `src/lib/file${index}.ts` })), { filename: 'tests/e2e/www.spec.ts' }];
    const { status, output, requests } = await check('fix-test', { PR_TITLE: 'fix: www reaches the apex in one hop' }, github({ files }));

    expect(status).toBe(0);
    expect(output).toContain('Changes a test: tests/e2e/www.spec.ts');
    expect(requests.map((request) => request.query.get('page'))).toEqual(['1', '2']);
  });

  it.each([
    'tests/unit/scripts/verify-deployment.test.ts',
    'tests/e2e/login.spec.ts',
    'tests/support/elements.ts',
    'src/lib/http/urlStandard.test.ts',
    'functions/api/router.spec.tsx',
    'src/lib/http/urlStandard.ts',
    'scripts/lib/fix-commits.ts',
    'src/tests/fixture.ts',
    '.github/workflows/ci.yml',
  ])('counts %s as a test exactly when the commit-msg hook does', async (filename) => {
    const { status } = await check('fix-test', { PR_TITLE: 'fix: the change' }, github({ files: [{ filename }] }));

    expect(status === 0).toBe(isTestFile(filename));
  });

  it('fails when GitHub will not list the files', async () => {
    const { status, output } = await check('fix-test', { PR_TITLE: 'fix: the change' }, github({ refuse: true }));

    expect(status).toBe(1);
    expect(output).toContain('GitHub answered 403 when asked for the files of #7.');
  });
});

describe('the evidence check', () => {
  const templateEvidence = ['## Evidence', '', '- Build:', '- Automated tests:', '- UI tests:', '- Installed or deployed artifact:', '- Owner acceptance:', '', 'Review:'];
  const reportedEvidence = [
    '## Evidence',
    '',
    '- Build: CI run 38262303273',
    '- Automated tests: pnpm run check passed on the final commit',
    '* ui tests: none, no screen changed',
    '- Installed or deployed artifact: the staging deploy after merge',
    '- Owner acceptance: pending',
  ];

  it('passes a body that says something for every level, a level that does not apply included', async () => {
    const { status, requests } = await check('evidence', { PR_BODY: ['Closes #12', '', ...reportedEvidence, '', '## Status', 'Done.'].join('\r\n') });

    expect(status).toBe(0);
    expect(requests).toEqual([]);
  });

  it.each([
    ['the template left as it is', ['Closes #12', '', ...templateEvidence], 'Build, Automated tests, UI tests, Installed or deployed artifact, Owner acceptance'],
    ['a level reported under another heading', [...reportedEvidence.filter((line) => !line.startsWith('- Build')), '', '## Status', '- Build: green'], 'Build'],
  ])('fails %s, naming the levels it says nothing for', async (_case, lines, silent) => {
    const { status, output } = await check('evidence', { PR_BODY: lines.join('\n') });

    expect(status).toBe(1);
    expect(output).toContain(`The evidence says nothing for: ${silent}.`);
    expect(output).toContain('A lower level never proves a higher one');
  });

  it('fails a body with no Evidence section', async () => {
    const { status, output } = await check('evidence', { PR_BODY: 'Closes #12\n\n## Why\nBecause.' });

    expect(status).toBe(1);
    expect(output).toContain('The body has no "## Evidence" section.');
  });

  it("exempts a promotion from this repository's own branch, whose evidence is Staging's deploy of the same files", async () => {
    const promotion = { PR_BODY: 'Promotes staging 07ec182.', PR_BRANCH: 'promote/staging-2026-10-12-07ec182', PR_HEAD_REPOSITORY: REPOSITORY };

    expect((await check('evidence', promotion)).status).toBe(0);
  });
});

const checkJob = z.object({ if: z.string(), steps: z.array(workflowStepSchema) });
const workflow = z
  .object({
    permissions: z.record(z.string()),
    jobs: z.object({ title: checkJob, 'issue-link': checkJob, 'fix-test': checkJob, evidence: checkJob }).passthrough(),
  })
  .parse(readWorkflowFile('.github/workflows/pull-request.yml'));

describe('the Pull request workflow', () => {
  it('only reads, with the workflow token', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'read', issues: 'read' });
  });

  it.each(['title', 'issue-link', 'fix-test', 'evidence'] as const)(
    'runs %s from the checked-out script alone, with what it reads in the environment, passing at once in the merge queue and for bots',
    (name) => {
      const job = workflow.jobs[name];
      const [checkout, run] = job.steps;

      expect(job.if).toBe("github.event_name != 'pull_request' || github.event.pull_request.user.type != 'Bot'");
      expect(job.steps.every((step) => step.if === "github.event_name == 'pull_request'")).toBe(true);
      expect(checkout?.with?.['sparse-checkout']).toBe(SCRIPT);
      expect(run?.run).toBe(`node ${SCRIPT} ${name}`);
      expect(job.steps).toHaveLength(2);
    },
  );
});
