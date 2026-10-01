import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  aWorkDirRemovedAfterAll,
  expectTheGuardToFailWithNoLogOrAnErrorResult,
  readWorkflowFile,
  runNodeScript,
  withAFakeGitHubApi,
  workflowStepSchema,
  writeTheGuardAndItsLog,
} from '../../support/workflowGuards';

const SKILL_PATH = '.claude/skills/pr-review/SKILL.md';
const skillFrontmatter = z
  .object({ 'allowed-tools': z.string() })
  .parse(yaml.load(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(SKILL_PATH, 'utf8'))?.[1] ?? ''));
const SKILL_TOOLS = skillFrontmatter['allowed-tools'].split(',').map((tool) => tool.trim()).filter(Boolean);

const workflowSchema = z.object({
  jobs: z.object({ review: z.object({ steps: z.array(workflowStepSchema) }) }),
});

const steps = workflowSchema.parse(readWorkflowFile('.github/workflows/claude-code-review.yml')).jobs.review.steps;
const reviewIndex = steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const reviewStep = steps[reviewIndex];
const claudeArgs = String(reviewStep?.with?.claude_args ?? '');

const findGuard = () => {
  const outputRef = `steps.${reviewStep.id}.outputs.execution_file`;
  const guardIndex = steps.findIndex((step) =>
    Object.values(step.env ?? {}).some((value) => value.includes(outputRef)),
  );
  const guard = steps[guardIndex];
  const envName = Object.entries(guard?.env ?? {}).find(([, value]) => value.includes(outputRef))?.[0];
  return { guard, guardIndex, envName };
};

const workDir = aWorkDirRemovedAfterAll('claude-review-guard-');

const REPO = 'serpcompany/serplists.com';
const PR = '7';
const BOT = 'claude[bot]';
const STARTED_AT = '2026-10-01T10:00:00Z';
const minutesAfterStart = (minutes: number) => new Date(Date.parse(STARTED_AT) + minutes * 60_000).toISOString();

type Posted = { login: string; at: string; updatedAt?: string; details?: Record<string, unknown> };
type PullRequest = {
  issueComments?: Posted[];
  reviewComments?: Posted[];
  reviews?: Posted[];
  status?: number;
};

const withFakeGitHub = <T>(pullRequest: PullRequest, run: (apiUrl: string) => Promise<T>) => {
  const toComments = (items: Posted[] = []) =>
    items.map(({ login, at, updatedAt, details }) => ({
      user: { login },
      created_at: at,
      updated_at: updatedAt ?? at,
      ...details,
    }));
  const routes: Record<string, unknown[]> = {
    [`/repos/${REPO}/issues/${PR}/comments`]: toComments(pullRequest.issueComments),
    [`/repos/${REPO}/pulls/${PR}/comments`]: toComments(pullRequest.reviewComments),
    [`/repos/${REPO}/pulls/${PR}/reviews`]: (pullRequest.reviews ?? []).map(({ login, at }) => ({
      user: { login },
      submitted_at: at,
    })),
  };
  return withAFakeGitHubApi((url, response) => {
    const body = routes[url.pathname];
    const status = pullRequest.status ?? (body ? 200 : 404);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(status === 200 ? body : { message: 'Not allowed' }));
  }, run);
};

const runGuard = (executionLog: unknown, pullRequest: PullRequest = {}) =>
  withFakeGitHub(pullRequest, (apiUrl) => {
    const { guard, envName } = findGuard();
    const { scriptPath, executionFile } = writeTheGuardAndItsLog(workDir, guard.run ?? '', executionLog);
    return runNodeScript(scriptPath, {
      [envName ?? 'EXECUTION_FILE']: executionFile,
      GITHUB_API_URL: apiUrl,
      GITHUB_REPOSITORY: REPO,
      GITHUB_STEP_SUMMARY: '',
      GITHUB_TOKEN: 'test-token',
      PR_NUMBER: PR,
      REVIEW_BOT: BOT,
      REVIEW_STARTED_AT: STARTED_AT,
    });
  });

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 24,
  duration_ms: 312_000,
  total_cost_usd: 2.4,
  modelUsage: { 'claude-sonnet-5-5': {}, 'claude-haiku-4-5-20251001': {}, 'claude-opus-5-5': {} },
  permission_denials: [],
  result: 'Posted 2 inline comments.',
  ...overrides,
});
const cleanLog = [{ type: 'system', subtype: 'init' }, resultEntry()];
const deniedGhPrView = {
  permission_denials: [{ tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'gh pr view 7 --comments' } }],
};

describe('Claude code review workflow', () => {
  it('runs the repository review skill, from the base branch, with every tool it uses', () => {
    expect(reviewStep?.id, 'the review step needs an id so later steps can read its outputs').toBeTruthy();
    expect(reviewStep.with?.prompt, 'the review runs the skill in .claude/, which the action restores from the base branch').toBe('/pr-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}');
    expect(reviewStep.with?.plugins).toBeUndefined();
    const allowList = claudeArgs.match(/--allowedTools\s+"([^"]+)"/)?.[1] ?? '';
    const allowed = new Set(allowList.split(',').map((tool) => tool.trim()));

    expect(SKILL_TOOLS).toContain('mcp__github_inline_comment__create_inline_comment');
    for (const tool of SKILL_TOOLS) {
      expect(allowed.has(tool), `claude_args does not allow ${tool}`).toBe(true);
    }
  });

  it('keeps subagents in the foreground, so the review ends only after they report', () => {
    expect(reviewStep.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
  });

  it('gives Claude and its subagents the rules outside the checkout', () => {
    for (const step of steps) {
      expect(step.run ?? '', 'the action deletes a CLAUDE.md the base branch lacks, so no step may write one').not.toMatch(/>\s*"?CLAUDE\.md/);
    }

    const rulesStep = steps.findIndex((step) => step.run?.includes('"$RUNNER_TEMP/review-context.md"'));
    expect(rulesStep, 'no step writes $RUNNER_TEMP/review-context.md').toBeGreaterThan(-1);
    expect(rulesStep).toBeLessThan(reviewIndex);
    expect(steps[rulesStep].env?.BASE_REF, 'the rules come from the base branch, so a PR cannot weaken them').toBe('${{ github.event.pull_request.base.ref }}');
    expect(steps[rulesStep].run).toContain('git show FETCH_HEAD:AGENTS.md');
    expect(steps[rulesStep].run).toContain('git show FETCH_HEAD:docs/design-docs/core-beliefs.md');
    expect(steps[rulesStep].run).not.toMatch(/\bcat AGENTS\.md/);
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/review-context.md');
    expect(claudeArgs).toContain('--append-subagent-system-prompt-file ${{ runner.temp }}/review-context.md');
    expect(claudeArgs).toContain('--strict-mcp-config');
  });

  it('runs a guard after the review that reads its execution log and the PR', () => {
    const { guard, guardIndex, envName } = findGuard();

    expect(guard, 'no step reads the review execution_file output').toBeDefined();
    expect(guardIndex).toBeGreaterThan(reviewIndex);
    expect(envName).toBeTruthy();
    expect(guard.shell).toBe('node {0}');
    expect(guard.if ?? '').toContain("env.HAS_REVIEW_TOKEN == 'true'");
    expect(guard.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}', REVIEW_BOT: BOT });

    const startIndex = steps.findIndex((step) => step.run?.includes('REVIEW_STARTED_AT='));
    expect(startIndex, 'no step records when the review starts').toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(reviewIndex);
  });

  it('fails when the run left no log or ended in an error', async () => {
    await expectTheGuardToFailWithNoLogOrAnErrorResult(runGuard, resultEntry);
  });

  it('fails when the run ended while subagents were still working', async () => {
    const { status, output } = await runGuard([
      { type: 'system', subtype: 'init' },
      {
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Check PR eligibility' }],
      },
      resultEntry({ num_turns: 2, result: 'Waiting on the eligibility check before proceeding.' }),
    ]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error');
    expect(output).toContain('Check PR eligibility');
  });

  it('fails when Claude posted nothing, and shows what Claude said', async () => {
    const { status, output } = await runGuard(
      [resultEntry({ result: 'This PR only bumps a version, so it does not need a review.' })],
      { issueComments: [{ login: 'devinschumacher', at: minutesAfterStart(3) }] },
    );

    expect(status).not.toBe(0);
    expect(output).toContain('::error');
    expect(output).toContain('does not need a review');
  });

  it('fails when Claude was denied a tool and posted nothing', async () => {
    const { status, output } = await runGuard([resultEntry(deniedGhPrView)]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error');
    expect(output).toContain('gh pr view 7 --comments');
  });

  it('fails when it cannot read the PR to check', async () => {
    const { status, output } = await runGuard(cleanLog, { status: 403 });

    expect(status).not.toBe(0);
    expect(output).toContain('403');
  });

  it.each([
    ['a summary comment', { issueComments: [{ login: BOT, at: minutesAfterStart(4) }] }],
    ['inline comments', { reviewComments: [{ login: BOT, at: minutesAfterStart(5) }] }],
    ['a review', { reviews: [{ login: BOT, at: minutesAfterStart(5) }] }],
  ])('passes when Claude posted %s during the run', async (_what, pullRequest: PullRequest) => {
    const { status, output } = await runGuard(cleanLog, pullRequest);

    expect(output).not.toContain('::error');
    expect(output).toContain('about $2.40');
    expect(status).toBe(0);
  });

  it('passes with a warning when Claude posted a review despite a denied tool', async () => {
    const { status, output } = await runGuard([resultEntry(deniedGhPrView)], {
      reviewComments: [{ login: BOT, at: minutesAfterStart(5) }],
    });

    expect(output).toContain('::warning');
    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });

  it('passes when Claude updated its summary comment during the run', async () => {
    const { status, output } = await runGuard(cleanLog, {
      issueComments: [{ login: BOT, at: minutesAfterStart(-90), updatedAt: minutesAfterStart(4) }],
    });

    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });

  it('fails when Claude reviewed an earlier push but posted and updated nothing now, since every push is reviewed again', async () => {
    const { status, output } = await runGuard(cleanLog, {
      reviewComments: [{ login: BOT, at: minutesAfterStart(-90) }],
      issueComments: [{ login: BOT, at: minutesAfterStart(-90) }],
    });

    expect(output).toContain('::error');
    expect(status).not.toBe(0);
  });
});

const findingsIndex = steps.findIndex((step) => step.env?.CONTEXT_FILE !== undefined);
const findingsStep = steps[findingsIndex];

const runFindings = (pullRequest: PullRequest) =>
  withFakeGitHub(pullRequest, (apiUrl) => {
    const scriptPath = path.join(workDir, 'findings.cjs');
    const contextFile = path.join(workDir, 'review-context.md');
    writeFileSync(scriptPath, findingsStep?.run ?? '');
    writeFileSync(contextFile, '# Repository rules for this review\n');
    return runNodeScript(
      scriptPath,
      {
        CONTEXT_FILE: contextFile,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'test-token',
        PR_NUMBER: PR,
        REVIEW_BOT: BOT,
      },
      ['stdout'],
    ).then(({ status, output }) => ({ status, output, context: readFileSync(contextFile, 'utf8') }));
  });

describe('earlier findings passed to the review', () => {
  it('reads them before the review, after the rules', () => {
    expect(findingsIndex, 'no step writes the earlier findings').toBeGreaterThan(-1);
    expect(findingsIndex).toBeLessThan(reviewIndex);
    const rulesStep = steps.findIndex((step) => step.run?.includes('"$RUNNER_TEMP/review-context.md"'));
    expect(findingsIndex).toBeGreaterThan(rulesStep);
    expect(findingsStep.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}', REVIEW_BOT: BOT });
  });

  it("lists Claude's inline comments and summary, and leaves out everyone else's", async () => {
    const { status, context } = await runFindings({
      reviewComments: [
        {
          login: BOT,
          at: minutesAfterStart(-60),
          details: {
            path: 'functions/api/keys.ts',
            line: 18,
            commit_id: 'abc1234def',
            html_url: 'https://github.com/c/1',
            body: '**Access check is broken.** Any key can edit public templates.',
          },
        },
        {
          login: BOT,
          at: minutesAfterStart(-60),
          details: { path: 'functions/api/log.ts', line: null, original_line: 9, commit_id: 'abc1234def', html_url: 'https://github.com/c/2', body: 'Logs an email.' },
        },
        { login: 'someone', at: minutesAfterStart(-50), details: { path: 'x.ts', line: 1, body: 'Not Claude.' } },
      ],
      issueComments: [
        { login: BOT, at: minutesAfterStart(-60), details: { html_url: 'https://github.com/c/3', body: '## Claude review\nReviewed abc1234.' } },
      ],
    });

    expect(status).toBe(0);
    expect(context).toContain('# Repository rules for this review');
    expect(context).toContain('# Earlier findings on this pull request');
    expect(context).toContain('functions/api/keys.ts:18, on commit abc1234 (https://github.com/c/1): **Access check is broken.**');
    expect(context).toContain('functions/api/log.ts:9 (outdated: the code there changed)');
    expect(context).toContain('Summary comment (https://github.com/c/3): ## Claude review Reviewed abc1234.');
    expect(context).not.toContain('Not Claude.');
  });

  it('says when this is the first review', async () => {
    const { status, context } = await runFindings({});

    expect(status).toBe(0);
    expect(context).toContain('None: this is the first review of this pull request.');
  });

  it('fails the job when it cannot read the pull request', async () => {
    const { status, output } = await runFindings({ status: 403 });

    expect(output).toContain('::error');
    expect(status).not.toBe(0);
  });
});
