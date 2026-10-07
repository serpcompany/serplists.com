import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { elementAt } from '../../support/elements';
import {
  aWorkDirRemovedAfterAll,
  expectTheGuardToFailWithNoLogOrAnErrorResult,
  readWorkflowFile,
  runNodeScript,
  withAFakeGitHubApi,
  workflowStepSchema,
  writeTheGuardAndItsLog,
} from '../../support/workflowGuards';

const workflow = z
  .object({
    on: z.record(z.unknown()),
    concurrency: z.object({ group: z.string() }),
    jobs: z.object({
      claude: z.object({
        if: z.string(),
        env: z.record(z.string()),
        permissions: z.record(z.string()),
        steps: z.array(workflowStepSchema),
      }),
    }),
  })
  .parse(readWorkflowFile('.github/workflows/claude.yml'));

const job = workflow.jobs.claude;
const claudeIndex = job.steps.findIndex((step) => step.uses?.startsWith('anthropics/claude-code-action'));
const claudeStep = elementAt(job.steps, claudeIndex);
const claudeArgs = String(claudeStep.with?.['claude_args'] ?? '');
const rulesStep = job.steps.find((step) => step.run?.includes('claude-rules.md'));
const guard = job.steps.find((step) =>
  Object.values(step.env ?? {}).some((value) => value.includes(`steps.${claudeStep.id}.outputs.execution_file`)),
);

const REPO = 'serpcompany/serplists.com';
const BOT = 'claude[bot]';
const STARTED_AT = '2026-10-04T10:00:00Z';
const minutesAfterStart = (minutes: number) => new Date(Date.parse(STARTED_AT) + minutes * 60_000).toISOString();

type Commit = { sha: string; author?: string; at?: string; message?: string; files?: string[] };
type Request = { onPullRequest?: boolean; commits?: Commit[] };

const workDir = aWorkDirRemovedAfterAll('claude-request-guard-');

const runGuard = (executionLog: unknown, { onPullRequest = true, commits = [] }: Request = {}) =>
  withAFakeGitHubApi(
    (url, response) => {
      const commitDetail = /^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)$/.exec(url.pathname);
      let body: unknown = null;
      if (url.pathname === `/repos/${REPO}/pulls/7`) body = { head: { ref: 'fl/feature', sha: 'headsha' } };
      if (url.pathname === `/repos/${REPO}/commits`) {
        body = commits.map((item) => ({
          sha: item.sha,
          commit: { author: { name: item.author ?? BOT, date: item.at ?? minutesAfterStart(5) }, message: item.message ?? 'fix: rename the helper' },
        }));
      }
      if (commitDetail) body = { files: (commits.find((item) => item.sha === commitDetail[1])?.files ?? []).map((filename) => ({ filename })) };
      response.writeHead(body === null ? 404 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body ?? { message: 'Not Found' }));
    },
    (apiUrl) => {
      const { scriptPath, executionFile } = writeTheGuardAndItsLog(workDir, guard?.run ?? '', executionLog);
      return runNodeScript(scriptPath, {
        CLAUDE_BOT: BOT,
        CLAUDE_BRANCH: onPullRequest ? '' : 'claude/issue-12',
        CLAUDE_STARTED_AT: STARTED_AT,
        ENTITY_NUMBER: onPullRequest ? '7' : '12',
        EXECUTION_FILE: executionFile,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_STEP_SUMMARY: '',
        GITHUB_TOKEN: 'test-token',
        IS_PR: onPullRequest ? 'true' : 'false',
      });
    },
  );

const resultEntry = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 18,
  duration_ms: 240_000,
  total_cost_usd: 0.9,
  modelUsage: { 'claude-sonnet-5-5': {} },
  permission_denials: [],
  result: 'Renamed the helper and pushed abc1234.',
  ...overrides,
});
const replied = [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_reply', name: 'mcp__github_comment__update_claude_comment' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_reply', is_error: false }] } },
];
const pushedByClaude: Commit = { sha: 'abc1234aaa' };

describe('the @claude workflow', () => {
  it('answers @claude in comments, reviews and issues, but never a bot, so its own comments cannot start it again', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['issue_comment', 'issues', 'pull_request_review', 'pull_request_review_comment']);
    expect(job.if).toContain("github.event.sender.type != 'Bot'");
    expect(job.if.match(/@claude/g)?.length).toBeGreaterThanOrEqual(4);
    expect(workflow.concurrency.group).toContain('github.event.issue.number || github.event.pull_request.number');
  });

  it('branches from staging and is told never to push to main or staging, with no attribution', () => {
    expect(job.env['BASE_BRANCH']).toBe('staging');
    expect(claudeStep.with?.['base_branch']).toBe('${{ env.BASE_BRANCH }}');
    expect(claudeStep.with?.['settings']).toBe('{"attribution": {"commit": "", "pr": ""}}');
    expect(rulesStep?.run).toContain('Never push to main or staging.');
    expect(rulesStep?.run).toContain('run `pnpm run verify`');
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/claude-rules.md');
  });

  it('stages files by path only, since the action resets .claude/ on a pull request and a blanket add would commit that reset', () => {
    for (const blanket of ['git add -A', 'git add --all', 'git add .', 'git add -u', 'git commit -a']) {
      expect(claudeArgs, blanket).toContain(`Bash(${blanket}`);
    }
    expect(claudeArgs).toContain('--allowedTools "Bash(pnpm run verify)"');
  });

  it('keeps subagents in the foreground and gives verify time to finish', () => {
    expect(claudeStep.env?.['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']).toBe('1');
    expect(claudeStep.env?.['BASH_DEFAULT_TIMEOUT_MS']).toBe('900000');
  });
});

describe('the check after an @claude request', () => {
  it('fails when Claude left no log or ended in an error', async () => {
    await expectTheGuardToFailWithNoLogOrAnErrorResult((log) => runGuard(log), resultEntry);
  });

  it('passes when Claude answered in its comment', async () => {
    const { status, output } = await runGuard([...replied, resultEntry()]);

    expect(output).toContain('Claude replied in its comment.');
    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });

  it('passes when Claude pushed to the pull request and replied', async () => {
    const { status, output } = await runGuard([...replied, resultEntry()], { commits: [pushedByClaude] });

    expect(output).toContain('pushed 1 commit(s) to fl/feature and replied in its comment');
    expect(status).toBe(0);
  });

  it("ignores commits by anyone else, or from before the request", async () => {
    const { status, output } = await runGuard([resultEntry({ result: 'I could not reproduce it.' })], {
      commits: [{ sha: 'personal1', author: 'Francis' }, { sha: 'earlier1', at: minutesAfterStart(-10) }],
    });

    expect(output).toContain('Claude neither pushed a commit nor updated its comment.');
    expect(output).toContain('I could not reproduce it.');
    expect(status).not.toBe(0);
  });

  it('fails when Claude pushed a commit with attribution', async () => {
    const { status, output } = await runGuard([...replied, resultEntry()], {
      commits: [{ sha: 'abc1234aaa', message: 'fix: rename\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }],
    });

    expect(output).toContain('with attribution in the commit message');
    expect(status).not.toBe(0);
  });

  it('warns when Claude changed a file the action resets on a pull request, and when it pushed without replying', async () => {
    const { status, output } = await runGuard([resultEntry()], { commits: [{ sha: 'abc1234aaa', files: ['.claude/settings.json'] }] });

    expect(output).toContain('Claude changed files the action resets');
    expect(output).toContain('Claude did not reply');
    expect(status).toBe(0);
  });

  it("reads the branch Claude made for an issue, not a pull request's", async () => {
    const { status, output } = await runGuard([...replied, resultEntry()], { onPullRequest: false, commits: [pushedByClaude] });

    expect(output).toContain('pushed 1 commit(s) to claude/issue-12');
    expect(status).toBe(0);
  });

  it('fails when Claude ended with subagents still running', async () => {
    const { status } = await runGuard([
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ description: 'Run the tests', ambient: false }] },
      ...replied,
      resultEntry(),
    ]);

    expect(status).not.toBe(0);
  });
});
