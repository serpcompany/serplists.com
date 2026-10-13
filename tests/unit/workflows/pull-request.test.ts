import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isTestFile } from '../../../scripts/lib/fix-commits';
import { runAgainstAGitHubStandIn, type Route } from '../../support/githubApiStandIn';
import { readWorkflowFile, workflowStepSchema } from '../../support/workflowGuards';

const REPOSITORY = 'serpcompany/serplists.com';
const SCRIPT = 'tools/checks/pull-request.mjs';
const ISSUES: Record<number, object> = { 12: { number: 12 }, 13: { number: 13 }, 296: { number: 296, pull_request: {} } };
const PROMOTION = { PR_BODY: 'Promotes staging 07ec182.', PR_BRANCH: 'promote/staging-2026-10-12-07ec182', PR_HEAD_REPOSITORY: REPOSITORY };
const COMMANDS_STOPPED = ['stop-commands', 'resume'];

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

function commandsTheRunnerRuns(output: string): string[] {
  const ran: string[] = [];
  let stoppedUntil: string | undefined;
  for (const line of output.split(/\r\n|\r|\n/)) {
    const command = /^::([^\s:]+)/.exec(line.trimStart())?.[1] ?? /##\[([^\s\]]+)/.exec(line)?.[1];
    if (command === undefined) continue;
    if (stoppedUntil !== undefined) {
      if (command === stoppedUntil) {
        stoppedUntil = undefined;
        ran.push('resume');
      }
      continue;
    }
    if (command === 'stop-commands') stoppedUntil = line.trimStart().slice('::stop-commands::'.length);
    ran.push(command);
  }
  return ran;
}

describe('the base check', () => {
  it.each([
    ['into staging', { PR_BASE: 'staging', PR_BRANCH: 'fix/12-www', PR_HEAD_REPOSITORY: REPOSITORY }],
    ['stacked on another branch', { PR_BASE: 'feat/12-www', PR_BRANCH: 'test/13-www', PR_HEAD_REPOSITORY: REPOSITORY }],
    ["into main from this repository's promote/ branch", { PR_BASE: 'main', PR_BRANCH: 'promote/staging-2026-10-12-07ec182', PR_HEAD_REPOSITORY: REPOSITORY }],
  ])('passes a pull request %s without asking GitHub', async (_case, pullRequest) => {
    const { status, requests } = await check('base', pullRequest);

    expect(status).toBe(0);
    expect(requests).toEqual([]);
  });

  it.each([
    ['a hotfix branch', { PR_BRANCH: 'fix/12-www', PR_HEAD_REPOSITORY: REPOSITORY }],
    ['staging itself', { PR_BRANCH: 'staging', PR_HEAD_REPOSITORY: REPOSITORY }],
    ["a fork's promote/ branch", { PR_BRANCH: 'promote/staging-2026-10-12-07ec182', PR_HEAD_REPOSITORY: 'someone/serplists.com' }],
  ])('fails a pull request into main from %s, which the Production deploy would refuse, saying to land it on staging and promote it', async (_case, pullRequest) => {
    const { status, output } = await check('base', { PR_BASE: 'main', ...pullRequest });

    expect(status).toBe(1);
    expect(output).toContain('::error::A pull request into main is not a promotion.');
    expect(output).toContain(`A pull request into main from ${pullRequest.PR_BRANCH} is not a promotion.`);
    expect(output).toContain('Open this pull request into staging instead; once Staging\'s deploy of it passes, pnpm run promote:prepare');
  });

  it('fails when it is not told which branch the pull request merges into', async () => {
    const { status, output } = await check('base', { PR_BRANCH: 'fix/12-www', PR_HEAD_REPOSITORY: REPOSITORY });

    expect(status).toBe(1);
    expect(output).toContain('::error::PR_BASE, the branch the pull request merges into, is not set.');
  });
});

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
      expect(output).toContain('::error::The title is not a Conventional Commit.');
      expect(output).toContain(`"${title}" is not a Conventional Commit.`);
      expect(output).toContain('Start it with one of feat, fix, perf, refactor, docs, test, build, ci, chore');
    },
  );

  it.each([
    ['a shell command', 'Say the stage; $(echo ran) `echo ran`'],
    ['a workflow command after a carriage return', 'x\r::warning file=src/a.ts::planted'],
  ])('reads a title holding %s as text, and runs nothing it holds', async (_case, title) => {
    const { status, output } = await check('title', { PR_TITLE: title });

    expect(status).toBe(1);
    expect(output).toContain(`"${title}" is not a Conventional Commit.`);
    expect(commandsTheRunnerRuns(output)).toEqual(['error', ...COMMANDS_STOPPED]);
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

  it.each([
    ['a warning', 'x\r::warning file=src/a.ts::planted'],
    ['a mask', 'x\r::add-mask::planted'],
    ['a stop', 'x\r::stop-commands::planted'],
  ])('reads a body hiding %s after a carriage return as text, and runs nothing it holds', async (_case, body) => {
    const { status, output } = await check('issue-link', { PR_BODY: body });

    expect(status).toBe(1);
    expect(output).toContain(`The body starts with "${body}".`);
    expect(commandsTheRunnerRuns(output)).toEqual(['error', ...COMMANDS_STOPPED]);
  });
});

describe('a promotion', () => {
  it.each(['issue-link', 'evidence'])(
    "skips %s only into main from this repository's own promote/ branch: its merge closes what its pull requests closed, and its evidence is Staging's deploy",
    async (name) => {
      expect((await check(name, { ...PROMOTION, PR_BASE: 'main' })).status).toBe(0);
      expect((await check(name, { ...PROMOTION, PR_BASE: 'staging' })).status).toBe(1);
      expect((await check(name, { ...PROMOTION, PR_BASE: 'main', PR_HEAD_REPOSITORY: 'someone/serplists.com' })).status).toBe(1);
    },
  );
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
    expect(output).toContain('Changes no test:\n- next.config.ts\n');
    expect(output).toContain('adds or changes the test that fails without the fix');
  });

  it.each([
    ['fails', ['::error::named like a command.ts', 'src/##[add-mask]legacy.ts', 'src/two\n::warning::lines.ts'], 1, ['error', ...COMMANDS_STOPPED]],
    ['passes', ['tests/::error::named like a command.test.ts', 'tests/##[add-mask]legacy.test.ts', 'tests/two\r::warning::lines.test.ts'], 0, COMMANDS_STOPPED],
  ])('lists the files of a fix that %s with workflow commands stopped, so a file named like a command runs none', async (_case, named, exitCode, commands) => {
    const { status, output } = await check('fix-test', { PR_TITLE: 'fix: the change' }, github({ files: named.map((filename) => ({ filename })) }));

    expect(status).toBe(exitCode);
    expect(output).toContain(`- ${named[0] ?? ''}`);
    expect(commandsTheRunnerRuns(output)).toEqual(commands);
  });

  it('passes a fix whose test is on a later page of its files', async () => {
    const files = [...Array.from({ length: 100 }, (_, index) => ({ filename: `src/lib/file${index}.ts` })), { filename: 'tests/e2e/www.spec.ts' }];
    const { status, output, requests } = await check('fix-test', { PR_TITLE: 'fix: www reaches the apex in one hop' }, github({ files }));

    expect(status).toBe(0);
    expect(output).toContain('Changes a test:\n- tests/e2e/www.spec.ts');
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
});

const checkJob = z.object({ if: z.string().optional(), steps: z.array(workflowStepSchema) });
const workflow = z
  .object({
    permissions: z.record(z.string()),
    jobs: z.object({ base: checkJob, title: checkJob, 'issue-link': checkJob, 'fix-test': checkJob, evidence: checkJob }).passthrough(),
  })
  .parse(readWorkflowFile('.github/workflows/pull-request.yml'));
const SKIPS_BOTS = "github.event_name != 'pull_request' || github.event.pull_request.user.type != 'Bot'";

describe('the Pull request workflow', () => {
  it('only reads, with the workflow token', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'read', issues: 'read' });
  });

  it.each([
    ['base', "every pull request, a bot's included, since a bot's pull request into main can't deploy either", undefined],
    ['title', "a person's pull request", SKIPS_BOTS],
    ['issue-link', "a person's pull request", SKIPS_BOTS],
    ['fix-test', "a person's pull request", SKIPS_BOTS],
    ['evidence', "a person's pull request", SKIPS_BOTS],
  ] as const)('runs %s on %s, from the checked-out script alone, with what it reads in the environment, passing at once in the merge queue', (name, _whose, condition) => {
    const job = workflow.jobs[name];
    const [checkout, run] = job.steps;

    expect(job.if).toBe(condition);
    expect(job.steps.every((step) => step.if === "github.event_name == 'pull_request'")).toBe(true);
    expect(checkout?.with?.['sparse-checkout']).toBe(SCRIPT);
    expect(run?.run).toBe(`node ${SCRIPT} ${name}`);
    expect(job.steps).toHaveLength(2);
  });

  it.each(['base', 'issue-link', 'evidence'] as const)('tells %s the branch the pull request merges into, and the branch and repository it comes from', (name) => {
    expect(workflow.jobs[name].steps[1]?.env).toMatchObject({
      PR_BASE: '${{ github.base_ref }}',
      PR_BRANCH: '${{ github.head_ref }}',
      PR_HEAD_REPOSITORY: '${{ github.event.pull_request.head.repo.full_name }}',
    });
  });
});
