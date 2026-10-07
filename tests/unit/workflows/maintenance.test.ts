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

const workflowSchema = z.object({
  on: z.object({ workflow_dispatch: z.object({ inputs: z.object({ job: z.object({ options: z.array(z.string()) }) }) }) }),
  jobs: z.record(z.object({ if: z.string().optional(), steps: z.array(workflowStepSchema).optional() })),
});

const maintenance = workflowSchema.parse(readWorkflowFile('.github/workflows/maintenance.yml'));
const steps = Object.values(maintenance.jobs).flatMap((job) => job.steps ?? []);
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

  it('adds no attribution to the commits and PRs it makes, set as empty strings since the action ignores false', () => {
    const settings = z
      .object({ attribution: z.object({ commit: z.literal(''), pr: z.literal('') }) })
      .safeParse(JSON.parse(String(gardenStep?.with?.['settings'] ?? '{}')));
    expect(settings.success).toBe(true);
  });

  it('re-grades the quality score rows whose code changed, dating each one, and writes the PR body to a file', () => {
    const prompt = String(gardenStep?.with?.['prompt'] ?? '');

    expect(prompt).toContain('the rows under "Scores to re-grade"');
    expect(prompt).toContain("Set the row's Graded date to today");
    expect(prompt).toContain('--body-file tmp/pr-body.md');
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

describe('choosing which weekly job runs', () => {
  it('runs every job on the schedule, and only the chosen one from the Actions tab', () => {
    expect(maintenance.on.workflow_dispatch.inputs.job.options).toEqual(['all', 'doc-gardening', 'code-gardening', 'report']);
    for (const [name, job] of Object.entries(maintenance.jobs)) {
      expect(job.if, name).toBe(`github.event_name != 'workflow_dispatch' || inputs.job == 'all' || inputs.job == '${name}'`);
    }
  });
});

const codeSteps = maintenance.jobs['code-gardening']?.steps ?? [];
const codeGardenIndex = codeSteps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const codeGarden = codeSteps[codeGardenIndex];
const codeGuard = codeSteps.find(
  (step) => step.run !== undefined && Object.values(step.env ?? {}).some((value) => value.includes(`steps.${codeGarden?.id}.outputs.execution_file`)),
);

type GardeningPr = OpenPr & { body?: string; commitMessages?: string[] };

const runCodeGuard = (executionLog: unknown, openPrs: GardeningPr[] = [], status = 200) =>
  withAFakeGitHubApi(
    (url, response) => {
      const commitsOf = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/commits$/.exec(url.pathname);
      let body: unknown = { message: 'Not Found' };
      let code = 404;
      if (url.pathname === `/repos/${REPO}/pulls` && url.searchParams.get('base') === 'staging') {
        code = status;
        body = status === 200 ? openPrs.map((pr) => ({ number: pr.number, title: 'refactor: split the template routes (TD-8)', body: pr.body ?? 'TD-8', head: { ref: pr.ref }, created_at: pr.createdAt })) : { message: 'Not allowed' };
      } else if (commitsOf) {
        code = 200;
        body = (openPrs.find((pr) => String(pr.number) === commitsOf[1])?.commitMessages ?? ['refactor: split the template routes (TD-8)']).map((message, index) => ({ sha: `sha${index}abcdef`, commit: { message } }));
      }
      response.writeHead(code, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    },
    (apiUrl) => {
      const { scriptPath, executionFile } = writeTheGuardAndItsLog(workDir, codeGuard?.run ?? '', executionLog);
      return runNodeScript(scriptPath, {
        EXECUTION_FILE: executionFile,
        GARDENING_STARTED_AT: STARTED_AT,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'test-token',
      });
    },
  );

const gardenedNow: GardeningPr = { number: 51, ref: 'chore/code-gardening-2026-10-05', createdAt: minutesAfterStart(20) };

describe('weekly code gardening workflow', () => {
  it('skips the week while a code gardening PR is still open', () => {
    const skip = codeSteps[0];
    expect(skip?.run).toContain('startswith("chore/code-gardening-")');
    expect(skip?.run).toContain('echo "GARDEN=true"');
    expect(codeSteps.slice(1).every((step) => step.if?.includes("env.GARDEN == 'true'"))).toBe(true);
  });

  it('fixes the oldest small tracker row, or splits a file near the size limit, passing over anything a person decides', () => {
    const prompt = String(codeGarden?.with?.['prompt'] ?? '');

    expect(prompt).toContain('the oldest open row of docs/exec-plans/tech-debt-tracker.md whose Size is');
    expect(prompt).toContain('"Files near the size limit"');
    expect(prompt).toContain('Pass over an item that needs a migration, production data, billing, product');
    expect(prompt).toContain('Run `pnpm run verify`');
    expect(prompt).not.toContain('Check findings');
  });

  it('runs verify, opens a PR into staging, and adds no attribution', () => {
    const args = String(codeGarden?.with?.['claude_args'] ?? '');

    expect(args).toContain('Bash(pnpm run verify)');
    expect(args).toContain('Bash(gh pr create:*)');
    expect(args).not.toContain('gh pr merge');
    expect(codeGarden?.with?.['settings']).toBe('{"attribution": {"commit": "", "pr": ""}}');
    expect(codeGarden?.env?.['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']).toBe('1');
  });

  it('passes when Claude opened one gardening PR', async () => {
    const { status, output } = await runCodeGuard([resultEntry({ result: 'Opened #51.' })], [gardenedNow]);

    expect(status).toBe(0);
    expect(output).toContain('Code gardening opened #51');
  });

  it('passes when Claude found nothing to garden', async () => {
    const { status } = await runCodeGuard([resultEntry({ result: 'Nothing to garden: every small row needs the owner.' })]);

    expect(status).toBe(0);
  });

  it('fails when Claude opened more than one PR, since it fixes one item a week', async () => {
    const { status, output } = await runCodeGuard([resultEntry()], [gardenedNow, { ...gardenedNow, number: 52 }]);

    expect(status).not.toBe(0);
    expect(output).toContain('#51, #52');
  });

  it('fails when the PR or one of its commits carries attribution', async () => {
    const withTrailer = await runCodeGuard([resultEntry()], [{ ...gardenedNow, commitMessages: ['fix: x (TD-15)\n\nCo-Authored-By: Claude <noreply@anthropic.com>'] }]);
    const withLine = await runCodeGuard([resultEntry()], [{ ...gardenedNow, body: 'TD-15\n\nGenerated with [Claude Code](https://claude.com/claude-code)' }]);

    expect(withTrailer.status).not.toBe(0);
    expect(withTrailer.output).toContain('carry attribution');
    expect(withLine.status).not.toBe(0);
  });

  it('fails when Claude neither opened a PR nor said there was nothing to garden', async () => {
    const { status, output } = await runCodeGuard([resultEntry({ result: 'Gardening failed: verify reports 2 lint errors.' })]);

    expect(status).not.toBe(0);
    expect(output).toContain('Gardening failed: verify reports 2 lint errors.');
  });

  it('fails when the run left no log or ended in an error, or when it cannot list the PRs', async () => {
    await expectTheGuardToFailWithNoLogOrAnErrorResult((log) => runCodeGuard(log), resultEntry);
    const { status, output } = await runCodeGuard([resultEntry()], [], 403);
    expect(status).not.toBe(0);
    expect(output).toContain('Could not list the open PRs');
  });
});
