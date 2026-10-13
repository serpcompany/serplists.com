import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  allowedTools,
  claudeResult,
  claudeStep,
  deniedCommand,
  executionLog,
  expectFailureUnlessClaudeFinished,
  guardAfter,
  jobOf,
  minutesAfter,
  readWorkflow,
  type Route,
  runNodeStep,
  stepsOf,
  type WorkflowStep,
} from '../../support/claudeWorkflows';
import { firstOf } from '../../support/elements';

const maintenance = readWorkflow('.github/workflows/maintenance.yml');
const docSteps = stepsOf(maintenance, 'doc-gardening');
const { step: docGarden, index: docGardenIndex } = claudeStep(docSteps);
const { step: docGuard, index: docGuardIndex } = guardAfter(docSteps, docGarden);
const codeSteps = stepsOf(maintenance, 'code-gardening');
const { step: codeGarden, index: codeGardenIndex } = claudeStep(codeSteps);
const { step: codeGuard, index: codeGuardIndex } = guardAfter(codeSteps, codeGarden);
const reportSteps = stepsOf(maintenance, 'report');
const promptOf = (step: WorkflowStep) => String(step.with?.['prompt'] ?? '').replace(/\s+/g, ' ');
const docPrompt = promptOf(docGarden);
const codePrompt = promptOf(codeGarden);

const REPOSITORY = 'serpcompany/serplists.com';
const STARTED_AT = '2026-10-05T14:00:00Z';
const minutesAfterStart = (minutes: number) => minutesAfter(STARTED_AT, minutes);

type OpenPr = { number: number; ref: string; createdAt: string; body?: string; commitMessages?: string[] };

const openPullRequests =
  (openPrs: OpenPr[], status: number): Route =>
  (url) => {
    if (url.pathname === `/repos/${REPOSITORY}/pulls` && url.searchParams.get('base') === 'staging') {
      if (status !== 200) return { status, body: { message: 'Not allowed' } };
      const listed = openPrs.map((pr) => ({ number: pr.number, title: 'refactor: split the template routes by action', body: pr.body ?? 'No issue: gardening.', head: { ref: pr.ref }, created_at: pr.createdAt }));
      return { status, body: listed };
    }
    const pr = openPrs.find((each) => url.pathname === `/repos/${REPOSITORY}/pulls/${each.number}/commits`);
    if (!pr) return undefined;
    return { status: 200, body: (pr.commitMessages ?? ['docs: weekly doc gardening']).map((message, index) => ({ sha: `sha${index}abcdef`, commit: { message } })) };
  };

const guardRunner =
  (step: WorkflowStep) =>
  (log: unknown, openPrs: OpenPr[] = [], status = 200) => {
    const { env, files } = executionLog(log);
    return runNodeStep(
      step,
      { ...env, GARDENING_STARTED_AT: STARTED_AT, GITHUB_REPOSITORY: REPOSITORY, BRANCH_PREFIX: step.env?.['BRANCH_PREFIX'] ?? '' },
      openPullRequests(openPrs, status),
      { files },
    );
  };
const runDocGuard = guardRunner(docGuard);
const runCodeGuard = guardRunner(codeGuard);

const result = claudeResult({ num_turns: 12, total_cost_usd: 0.4, result: 'I fixed one stale doc and opened a pull request.' });
const docsNow: OpenPr = { number: 41, ref: 'chore/doc-gardening-2026-10-05', createdAt: minutesAfterStart(3) };
const docsLastWeek: OpenPr = { number: 39, ref: 'chore/doc-gardening-2026-09-28', createdAt: minutesAfterStart(-7 * 24 * 60) };
const codeNow: OpenPr = { number: 51, ref: 'chore/code-gardening-2026-10-05', createdAt: minutesAfterStart(20) };
const deniedCommit = deniedCommand('git checkout -b chore/doc-gardening && git commit');
const attributed: [string, Partial<OpenPr>][] = [
  ['a commit', { commitMessages: ['docs: weekly doc gardening\n\nCo-Authored-By: Claude <noreply@anthropic.com>'] }],
  ['the body', { body: 'No issue: gardening.\n\nGenerated with [Claude Code](https://claude.com/claude-code)' }],
];

describe('the Weekly maintenance workflow', () => {
  it('runs every job on the schedule, and only the chosen one by hand', () => {
    const dispatch = z.object({ inputs: z.object({ job: z.object({ options: z.array(z.string()), default: z.string() }) }) }).parse(maintenance.on['workflow_dispatch']);

    expect(dispatch.inputs.job.options).toEqual(['all', 'doc-gardening', 'code-gardening', 'report']);
    expect(dispatch.inputs.job.default).toBe('all');
    expect(Object.keys(maintenance.jobs)).toEqual(['doc-gardening', 'code-gardening', 'report']);
    for (const [name, job] of Object.entries(maintenance.jobs)) {
      expect(job.if, name).toBe(`github.event_name != 'workflow_dispatch' || inputs.job == 'all' || inputs.job == '${name}'`);
    }
  });

  it('gives each job the placeholder secret the checks need, and runs no git hook in a job that commits', () => {
    for (const name of ['doc-gardening', 'code-gardening', 'report']) {
      expect(jobOf(maintenance, name).env?.['BETTER_AUTH_SECRET'], name).toBe('ci-build-placeholder-secret-32-chars-minimum');
    }
    for (const name of ['doc-gardening', 'code-gardening']) {
      expect(jobOf(maintenance, name).env?.['LEFTHOOK'], name).toBe('0');
      expect(stepsOf(maintenance, name).some((step) => step.run === 'pnpm install --frozen-lockfile'), name).toBe(true);
    }
  });

  it('gardens the docs from the maintenance report, in the docs layout, leaving decisions alone', () => {
    const reportIndex = docSteps.findIndex((step) => step.run?.includes('pnpm run --silent maintenance:report > tmp/maintenance-report.md'));

    expect(reportIndex).toBeGreaterThan(-1);
    expect(reportIndex).toBeLessThan(docGardenIndex);
    expect(docPrompt).toContain('Read tmp/maintenance-report.md');
    expect(docPrompt).toContain('the "Docs to re-verify" list, and the rows under "Scores to re-grade"');
    expect(docPrompt).toContain('Re-grade each row listed under "Scores to re-grade" in docs/quality.md.');
    expect(docPrompt).toContain("Set the row's Graded date to");
    expect(docPrompt).toContain('docs/adr/ (ADRs record decisions; never rewrite them)');
    expect(docPrompt).toContain('Run `pnpm run verify docs`');
    expect(docPrompt).toContain('--body-file tmp/pr-body.md');
    expect(docPrompt).not.toMatch(/Last verified|design-docs|docs:check|gh pr list/);
    expect(allowedTools(docGarden)).toEqual(expect.arrayContaining(['Bash(pnpm run verify docs:*)', 'Bash(gh pr create:*)', 'Bash(git:*)']));
  });

  it("has a re-graded row's evidence and main gap rewritten too, which docs/quality.md keeps in the line under its table", () => {
    expect(readFileSync('docs/quality.md', 'utf8').replace(/\s+/g, ' ')).toContain('The line under each table gives the evidence for each grade and the main gap');
    expect(docPrompt).toContain('Rewrite the row and its line under the table (the evidence and the main gap) to match the code as it is now');
  });

  it('pins the model, keeps subagents in the foreground, and leaves the MCP servers out', () => {
    for (const step of [docGarden, codeGarden]) {
      expect(step.id).toBe('garden');
      expect(step.env?.['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']).toBe('1');
      expect(step.env?.['BASH_DEFAULT_TIMEOUT_MS']).toBe('900000');
      expect(String(step.with?.['claude_args'])).toContain('--model claude-sonnet-5-5');
      expect(String(step.with?.['claude_args'])).toContain('--strict-mcp-config');
      expect(step.with?.['settings']).toBe('{"attribution": {"commit": "", "pr": ""}}');
    }
  });

  it('checks each gardening job afterwards, from when it started, even when Claude failed', () => {
    for (const [jobSteps, gardenAt, guardAt, guard] of [
      [docSteps, docGardenIndex, docGuardIndex, docGuard],
      [codeSteps, codeGardenIndex, codeGuardIndex, codeGuard],
    ] as const) {
      expect(guardAt).toBeGreaterThan(gardenAt);
      expect(guard.if).toBe("${{ !cancelled() && steps.garden.outcome != 'skipped' }}");
      expect(guard.env?.['GITHUB_TOKEN']).toBe('${{ github.token }}');
      const start = jobSteps.findIndex((step) => step.run?.includes('GARDENING_STARTED_AT='));
      expect(start).toBeGreaterThan(-1);
      expect(start).toBeLessThan(gardenAt);
    }
  });

  it('writes the report under tmp/, since a Markdown file at the root fails the docs check the report runs', () => {
    const runs = reportSteps.map((step) => step.run ?? '').join('\n');

    expect(runs).toContain('pnpm run --silent maintenance:report > tmp/weekly-report.md');
    expect(runs).not.toMatch(/> [\w-]+\.md/);
    expect(runs).toContain('gh issue list --state open --author app/github-actions --search "\\"$TITLE\\" in:title"');
    expect(runs).toContain('gh issue edit "$number" --body-file tmp/weekly-report.md');
    expect(runs).toContain('gh issue create --title "$TITLE" --body-file tmp/weekly-report.md');
    expect(jobOf(maintenance, 'report').env?.['TITLE']).toBe('Weekly repository maintenance');
  });

  it("collects the review's inline findings of the last four weeks before it builds the report, within a time limit", () => {
    const collect = reportSteps.findIndex((step) => step.run?.includes('tmp/review-findings.json'));
    const build = reportSteps.findIndex((step) => step.run?.includes('maintenance:report'));
    const run = reportSteps[collect]?.run ?? '';

    expect(collect).toBeGreaterThan(-1);
    expect(collect).toBeLessThan(build);
    expect(run).toContain('"repos/$GITHUB_REPOSITORY/pulls/comments?since=$since&per_page=100"');
    expect(run).toContain('select((.user.login == "github-actions[bot]" or .user.login == "claude[bot]") and .in_reply_to_id == null)');
    expect(run).toContain("date -u -d '28 days ago'");
    expect(reportSteps[collect]?.shell).toBe('bash');
    expect(jobOf(maintenance, 'report').permissions).toMatchObject({ 'pull-requests': 'read', issues: 'write' });
    expect(jobOf(maintenance, 'report')['timeout-minutes']).toBe(15);
  });
});

describe("doc gardening's guard", () => {
  it('fails unless Claude finished: no log, no result, an error, a refused token, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished((log) => runDocGuard(log), result);
  });

  it('passes when Claude opened one gardening pull request during the run', async () => {
    const { status, output } = await runDocGuard([result()], [docsNow]);

    expect(status).toBe(0);
    expect(output).toContain('Doc gardening opened #41.');
  });

  it('passes when Claude found no doc drift', async () => {
    expect((await runDocGuard([result({ result: 'No doc drift found' })])).status).toBe(0);
  });

  it("fails when Claude stopped for last week's open pull request, since the job skips such a week before Claude starts", async () => {
    const { status, output } = await runDocGuard([result({ result: 'A gardening pull request is already open (#39), so I stopped.' })], [docsLastWeek]);

    expect(status).not.toBe(0);
    expect(output).toContain('without opening a pull request');
  });

  it('fails when Claude opened more than one pull request, since it opens one a week', async () => {
    const { status, output } = await runDocGuard([result()], [docsNow, { ...docsNow, number: 42 }]);

    expect(status).not.toBe(0);
    expect(output).toContain('#41, #42');
  });

  it.each(attributed)('fails when %s carries attribution', async (_where, change) => {
    const { status, output } = await runDocGuard([result()], [{ ...docsNow, ...change }]);

    expect(status).not.toBe(0);
    expect(output).toContain('carry attribution');
  });

  it('fails when Claude finished without any of those, and shows what it said', async () => {
    const { status, output } = await runDocGuard([result({ result: 'Done.' })], [docsLastWeek]);

    expect(status).not.toBe(0);
    expect(output).toContain('Done.');
  });

  it('warns but passes when a refused command was retried and the pull request opened', async () => {
    const { status, output } = await runDocGuard([result(deniedCommit)], [docsNow]);

    expect(status).toBe(0);
    expect(output).toContain('::warning');
    expect(output).toContain('git checkout -b');
  });

  it('fails and names the command when a denial left the job undone', async () => {
    const { status, output } = await runDocGuard([result({ ...deniedCommit, result: 'Stopped.' })]);

    expect(status).not.toBe(0);
    expect(output).toContain('git checkout -b');
  });

  it("fails when it can't list the open pull requests", async () => {
    const { status, output } = await runDocGuard([result()], [], 403);

    expect(status).not.toBe(0);
    expect(output).toContain("Couldn't list the open pull requests");
  });
});

describe('each gardening job', () => {
  it.each([
    ['doc-gardening', docSteps, docGuard],
    ['code-gardening', codeSteps, codeGuard],
  ] as const)('%s skips the week while its last pull request into staging is still open, before it checks out anything', (name, jobSteps, guard) => {
    const skip = firstOf(jobSteps);

    expect(skip.run).toContain('--base staging');
    expect(skip.run).toContain(`startswith("chore/${name}-")`);
    expect(skip.run).toContain('echo "GARDEN=true"');
    expect(guard.env?.['BRANCH_PREFIX']).toBe(`chore/${name}-`);
    expect(jobSteps.slice(1).filter((step) => step !== guard).every((step) => step.if?.includes("env.GARDEN == 'true'"))).toBe(true);
  });
});

describe('the code gardening job', () => {
  it('gets an hour, since it runs the whole finish gate', () => {
    expect(jobOf(maintenance, 'code-gardening')['timeout-minutes']).toBe(60);
  });

  it('fixes the first small row of either debt file, or splits a file near the size limit, passing over what a person decides', () => {
    expect(codePrompt).toContain('the first row of docs/tech-debt.md, and then of docs/harness-debt.md, whose Size');
    expect(codePrompt).toContain('"Files near the size limit"');
    for (const passedOver of ['a migration', 'production or Staging data', 'a deploy', 'billing or Stripe', 'the behavior or wording a product doc describes', 'an ADR-level decision']) {
      expect(codePrompt).toContain(passedOver);
    }
    expect(codePrompt).toContain('Write no code comments.');
    expect(codePrompt).toContain('"Closes #<n>" when the row names an issue, or "No issue: <why>"');
  });

  it('runs the finish gate before it opens a pull request into staging, and can merge nothing', () => {
    expect(codePrompt).toContain('Run `pnpm run check`');
    expect(codePrompt).toContain('chore/code-gardening-<YYYY-MM-DD>');
    expect(allowedTools(codeGarden)).toEqual(expect.arrayContaining(['Bash(pnpm run check)', 'Bash(gh pr create:*)', 'Bash(git:*)']));
    expect(allowedTools(codeGarden).some((tool) => tool.includes('gh pr merge'))).toBe(false);
  });

  it('passes when Claude opened one gardening pull request', async () => {
    const { status, output } = await runCodeGuard([result({ result: 'Opened #51.' })], [codeNow]);

    expect(status).toBe(0);
    expect(output).toContain('Code gardening opened #51: refactor: split the template routes by action.');
  });

  it('passes when Claude found nothing to garden', async () => {
    expect((await runCodeGuard([result({ result: 'Nothing to garden: every small row needs the owner.' })], [docsNow])).status).toBe(0);
  });

  it('fails when Claude opened more than one pull request, since it fixes one item a week', async () => {
    const { status, output } = await runCodeGuard([result()], [codeNow, { ...codeNow, number: 52 }]);

    expect(status).not.toBe(0);
    expect(output).toContain('#51, #52');
  });

  it.each(attributed)('fails when %s carries attribution', async (_where, change) => {
    const { status, output } = await runCodeGuard([result()], [{ ...codeNow, ...change }]);

    expect(status).not.toBe(0);
    expect(output).toContain('carry attribution');
  });

  it('fails when Claude neither opened a pull request nor found nothing to garden', async () => {
    const said = 'Gardening failed: pnpm run check reports 2 lint errors.';
    const { status, output } = await runCodeGuard([result({ result: said })]);

    expect(status).not.toBe(0);
    expect(output).toContain(said);
  });

  it('fails unless Claude finished, or when it cannot list the pull requests', async () => {
    await expectFailureUnlessClaudeFinished((log) => runCodeGuard(log), result);
    const { status, output } = await runCodeGuard([result()], [], 403);

    expect(status).not.toBe(0);
    expect(output).toContain("Couldn't list the open pull requests");
  });
});
