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

const workflowSchema = z.object({ jobs: z.record(z.object({ steps: z.array(workflowStepSchema).optional() })) });

const steps = Object.values(workflowSchema.parse(readWorkflowFile('.github/workflows/maintenance.yml')).jobs).flatMap(
  (job) => job.steps ?? [],
);
const gardenIndex = steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const gardenStep = steps[gardenIndex];
const guardIndex = steps.findIndex(
  (step) =>
    step.run !== undefined &&
    Object.values(step.env ?? {}).some((value) => value.includes(`steps.${gardenStep?.id}.outputs.execution_file`)),
);
const guard = steps[guardIndex];

const REPO = 'serpcompany/serplists.com';
const STARTED_AT = '2026-10-05T14:00:00Z';
const minutesAfterStart = (minutes: number) => new Date(Date.parse(STARTED_AT) + minutes * 60_000).toISOString();
type OpenPr = { number: number; ref: string; createdAt: string };

const workDir = aWorkDirRemovedAfterAll('doc-gardening-guard-');

const runGuard = (executionLog: unknown, openPrs: OpenPr[] = [], status = 200) =>
  withAFakeGitHubApi(
    (url, response) => {
      const listsPrs = url.pathname === `/repos/${REPO}/pulls` && url.searchParams.get('base') === 'staging';
      response.writeHead(listsPrs ? status : 404, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          listsPrs && status === 200
            ? openPrs.map((pr) => ({ number: pr.number, head: { ref: pr.ref }, created_at: pr.createdAt }))
            : { message: 'Not allowed' },
        ),
      );
    },
    (apiUrl) => {
      const { scriptPath, executionFile } = writeTheGuardAndItsLog(workDir, guard?.run ?? '', executionLog);
      return runNodeScript(scriptPath, {
        EXECUTION_FILE: executionFile,
        GARDENING_STARTED_AT: STARTED_AT,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'test-token',
      });
    },
  );

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 12,
  total_cost_usd: 0.4,
  permission_denials: [],
  result: 'I fixed one stale doc and opened a PR into staging.',
  ...overrides,
});
const openedNow: OpenPr = { number: 41, ref: 'chore/doc-gardening-2026-10-05', createdAt: minutesAfterStart(3) };
const openedLastWeek: OpenPr = { number: 39, ref: 'chore/doc-gardening-2026-09-28', createdAt: minutesAfterStart(-7 * 24 * 60) };
const deniedCommit = {
  permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'git checkout -b chore/doc-gardening && git commit -m "x"' } }],
};

describe('weekly doc gardening workflow', () => {
  it('keeps subagents in the foreground and leaves the repository MCP servers out', () => {
    expect(gardenStep?.id).toBe('garden');
    expect(gardenStep?.env?.['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']).toBe('1');
    expect(String(gardenStep?.with?.['claude_args'])).toContain('--strict-mcp-config');
  });

  it('adds no attribution to the commits and PRs it makes', () => {
    const settings = z
      .object({ attribution: z.object({ commit: z.literal(false), pr: z.literal(false) }) })
      .safeParse(JSON.parse(String(gardenStep?.with?.['settings'] ?? '{}')));
    expect(settings.success).toBe(true);
  });

  it('runs a guard after Claude that reads its log and the open PRs', () => {
    expect(guard?.run).toBeTruthy();
    expect(guardIndex).toBeGreaterThan(gardenIndex);
    expect(guard?.env?.['GITHUB_TOKEN']).toBe('${{ github.token }}');
    const startIndex = steps.findIndex((step) => step.run?.includes('GARDENING_STARTED_AT='));
    expect(startIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(gardenIndex);
  });

  it('passes when Claude opened a gardening PR during the run', async () => {
    const { status, output } = await runGuard([resultEntry()], [openedNow]);
    expect(status).toBe(0);
    expect(output).toContain('opened #41');
  });

  it('passes when Claude found no doc drift', async () => {
    const { status } = await runGuard([resultEntry({ result: 'No doc drift found' })]);
    expect(status).toBe(0);
  });

  it("passes when last week's gardening PR is still open and Claude left it alone", async () => {
    const { status, output } = await runGuard(
      [resultEntry({ result: 'A gardening PR is already open (#39), so I stopped.' })],
      [openedLastWeek],
    );
    expect(status).toBe(0);
    expect(output).toContain('#39');
  });

  it('fails when Claude finished without any of those outcomes, and shows what it said', async () => {
    const { status, output } = await runGuard([resultEntry({ result: 'Done.' })], [openedLastWeek]);
    expect(status).not.toBe(0);
    expect(output).toContain('Done.');
  });

  it('warns but passes when a refused command was retried and the PR still opened', async () => {
    const { status, output } = await runGuard([resultEntry(deniedCommit)], [openedNow]);
    expect(status).toBe(0);
    expect(output).toContain('::warning');
    expect(output).toContain('git checkout -b');
  });

  it('fails and names the command when a denial left the job undone', async () => {
    const { status, output } = await runGuard([resultEntry({ ...deniedCommit, result: 'Stopped.' })]);
    expect(status).not.toBe(0);
    expect(output).toContain('git checkout -b');
  });

  it('fails when the run left no log, no result, or ended in an error', async () => {
    await expectTheGuardToFailWithNoLogOrAnErrorResult(runGuard, resultEntry);
  });

  it('fails when Claude ended with subagents still running', async () => {
    const { status, output } = await runGuard([
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ id: 'task-1' }] },
      resultEntry(),
    ]);
    expect(status).not.toBe(0);
    expect(output).toContain('background task');
  });

  it('fails when it cannot list the open PRs', async () => {
    const { status, output } = await runGuard([resultEntry()], [], 403);
    expect(status).not.toBe(0);
    expect(output).toContain('Could not list the open PRs');
  });
});

describe('weekly maintenance report workflow', () => {
  const reportStep = steps.find((step) => step.run?.includes('maintenance:report') && !step.run.includes('maintenance-report.md'));
  const issueStep = steps.find((step) => step.run?.includes('--body-file'));

  it('writes the report under tmp/, since a Markdown file at the root fails the docs check the report runs', () => {
    expect(reportStep?.run).toContain('> tmp/weekly-report.md');
    expect(reportStep?.run).not.toMatch(/> [\w-]+\.md/);
  });

  it('opens or updates the issue from that same file', () => {
    expect(issueStep?.run).toContain('--body-file tmp/weekly-report.md');
    expect(issueStep?.run).not.toContain('--body-file report.md');
  });
});
