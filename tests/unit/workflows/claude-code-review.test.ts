import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

// Tools the code-review plugin needs, copied from the `allowed-tools` frontmatter of
// https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md
// plus Task, the tool it launches its review subagents with. Update this list when the
// plugin changes; a tool missing from claude_args is denied at runtime.
const PLUGIN_TOOLS = [
  'Bash(gh issue view:*)',
  'Bash(gh search:*)',
  'Bash(gh issue list:*)',
  'Bash(gh pr comment:*)',
  'Bash(gh pr diff:*)',
  'Bash(gh pr view:*)',
  'Bash(gh pr list:*)',
  'mcp__github_inline_comment__create_inline_comment',
  'Task',
];

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  shell: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
  with: z.record(z.unknown()).optional(),
});
const workflowSchema = z.object({
  jobs: z.object({ review: z.object({ steps: z.array(stepSchema) }) }),
});

const steps = workflowSchema.parse(
  yaml.load(readFileSync('.github/workflows/claude-code-review.yml', 'utf8')),
).jobs.review.steps;
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

const workDir = mkdtempSync(path.join(tmpdir(), 'claude-review-guard-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const REPO = 'serpcompany/serplists.com';
const PR = '7';
const BOT = 'claude[bot]';
const STARTED_AT = '2026-10-01T10:00:00Z';
// A timestamp this many minutes after the review started (negative: before it).
const minutesAfterStart = (minutes: number) => new Date(Date.parse(STARTED_AT) + minutes * 60_000).toISOString();

type Posted = { login: string; at: string };
type PullRequest = {
  issueComments?: Posted[];
  reviewComments?: Posted[];
  reviews?: Posted[];
  status?: number;
};

// A stand-in for the GitHub REST API that serves one pull request's comments and reviews.
const withFakeGitHub = async <T>(pullRequest: PullRequest, run: (apiUrl: string) => Promise<T>) => {
  const toComments = (items: Posted[] = []) => items.map(({ login, at }) => ({ user: { login }, created_at: at }));
  const routes: Record<string, unknown[]> = {
    [`/repos/${REPO}/issues/${PR}/comments`]: toComments(pullRequest.issueComments),
    [`/repos/${REPO}/pulls/${PR}/comments`]: toComments(pullRequest.reviewComments),
    [`/repos/${REPO}/pulls/${PR}/reviews`]: (pullRequest.reviews ?? []).map(({ login, at }) => ({
      user: { login },
      submitted_at: at,
    })),
  };
  const server = createServer((request, response) => {
    const body = routes[new URL(request.url ?? '/', 'http://localhost').pathname];
    const status = pullRequest.status ?? (body ? 200 : 404);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(status === 200 ? body : { message: 'Not allowed' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

// Runs the guard step's code as the workflow does, against an execution log and a PR.
const runGuard = (executionLog: unknown, pullRequest: PullRequest = {}) =>
  withFakeGitHub(pullRequest, (apiUrl) => {
    const { guard, envName } = findGuard();
    const scriptPath = path.join(workDir, 'guard.cjs');
    writeFileSync(scriptPath, guard.run ?? '');
    let executionFile = '';
    if (executionLog !== undefined) {
      executionFile = path.join(workDir, 'execution.json');
      writeFileSync(executionFile, JSON.stringify(executionLog));
    }
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        [envName ?? 'EXECUTION_FILE']: executionFile,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_STEP_SUMMARY: '',
        GITHUB_TOKEN: 'test-token',
        PR_NUMBER: PR,
        REVIEW_BOT: BOT,
        REVIEW_STARTED_AT: STARTED_AT,
      },
    });
    let output = '';
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    return new Promise<{ status: number | null; output: string }>((resolve) => {
      child.on('close', (status) => resolve({ status, output }));
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
  it('allows every tool the code-review plugin uses', () => {
    expect(reviewStep?.id, 'the review step needs an id so later steps can read its outputs').toBeTruthy();
    const allowList = claudeArgs.match(/--allowedTools\s+"([^"]+)"/)?.[1] ?? '';
    const allowed = new Set(allowList.split(',').map((tool) => tool.trim()));

    for (const tool of PLUGIN_TOOLS) {
      expect(allowed.has(tool), `claude_args does not allow ${tool}`).toBe(true);
    }
  });

  it('keeps subagents in the foreground, so the review ends only after they report', () => {
    expect(reviewStep.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
  });

  it('gives Claude and its subagents the rules outside the checkout', () => {
    // The action deletes a CLAUDE.md the base branch lacks, so writing one is lost work.
    for (const step of steps) expect(step.run ?? '').not.toMatch(/>\s*"?CLAUDE\.md/);

    const rulesStep = steps.findIndex((step) => step.run?.includes('"$RUNNER_TEMP/review-rules.md"'));
    expect(rulesStep, 'no step writes $RUNNER_TEMP/review-rules.md').toBeGreaterThan(-1);
    expect(rulesStep).toBeLessThan(reviewIndex);
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/review-rules.md');
    expect(claudeArgs).toContain('--append-subagent-system-prompt-file ${{ runner.temp }}/review-rules.md');
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
    expect((await runGuard(undefined)).status).not.toBe(0);
    expect((await runGuard([{ type: 'system', subtype: 'init' }])).status).not.toBe(0);
    expect((await runGuard([resultEntry({ is_error: true, subtype: 'error_max_turns' })])).status).not.toBe(0);
  });

  it('fails when the run ended while subagents were still working', async () => {
    // What every run since 2026-09-29 looked like: 2 turns, no denials, nothing posted.
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

  it('passes with a notice when Claude reviewed the PR on an earlier push', async () => {
    const { status, output } = await runGuard(cleanLog, {
      reviewComments: [{ login: BOT, at: minutesAfterStart(-90) }],
    });

    expect(output).toContain('::notice');
    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });
});
