import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  allowedTools,
  type Answer,
  claudeResult,
  claudeStep,
  disallowedTools,
  executionLog,
  expectFailureUnlessClaudeFinished,
  gitIn,
  guardAfter,
  jobOf,
  minutesAfter,
  readWorkflow,
  type Route,
  runNodeStep,
  stepNamed,
  stepsOf,
} from '../../support/claudeWorkflows';
import { elementAt } from '../../support/elements';

const workflow = readWorkflow('.github/workflows/claude.yml');
const job = jobOf(workflow, 'claude');
const steps = stepsOf(workflow, 'claude');
const { step: claude, index: claudeIndex } = claudeStep(steps);
const claudeArgs = String(claude.with?.['claude_args'] ?? '');
const rules = steps.find((step) => step.run?.includes('claude-rules.md'))?.run ?? '';
const { step: guard, index: guardIndex } = guardAfter(steps, claude);
const indexOfUses = (action: string) => steps.findIndex((step) => step.uses?.startsWith(action));

const REPOSITORY = 'serpcompany/serplists.com';
const BOT = 'claude[bot]';
const STARTED_AT = '2026-10-04T10:00:00Z';
const minutesAfterStart = (minutes: number) => minutesAfter(STARTED_AT, minutes);

describe('the Claude workflow', () => {
  it('answers @claude in comments, reviews, and issues, but never a bot, so its own comments never start it again', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['issue_comment', 'issues', 'pull_request_review', 'pull_request_review_comment']);
    expect(job.if).toContain("github.event.sender.type != 'Bot'");
    expect(job.if?.match(/@claude/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('answers only the owners, members, and collaborators, before it checks out or installs anything', () => {
    for (const entity of ['comment', 'review', 'issue']) expect(job.if).toContain(`github.event.${entity}.author_association`);
    expect(job.if?.match(/fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\)/g)).toHaveLength(4);
  });

  it("runs one request per issue or pull request at a time, queued in the job so comments that don't ask never displace one", () => {
    expect(workflow.concurrency).toBeUndefined();
    expect(job.concurrency?.group).toContain('github.event.issue.number || github.event.pull_request.number');
    expect(job.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it("keeps the checkout's token out of the working tree, and runs no install script or pnpmfile from the pull request", () => {
    expect(elementAt(steps, indexOfUses('actions/checkout')).with?.['persist-credentials']).toBe(false);
    expect(steps.some((step) => step.run === 'pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile')).toBe(true);
  });

  it('branches from staging with the placeholder secret the checks need, and never pushes to main or staging', () => {
    expect(job.env?.['BASE_BRANCH']).toBe('staging');
    expect(job.env?.['BETTER_AUTH_SECRET']).toBe('ci-build-placeholder-secret-32-chars-minimum');
    expect(claude.with?.['base_branch']).toBe('${{ env.BASE_BRANCH }}');
    expect(elementAt(steps, indexOfUses('pnpm/action-setup')).with).toEqual({ package_json_file: 'package.json' });
    expect(rules).toContain('Never push to main or staging.');
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/claude-rules.md');
  });

  it('follows the repository rules, checks a change with the finish gate before pushing, and says what it could not check', () => {
    for (const file of ['AGENTS.md', 'ARCHITECTURE.md', 'docs/agents/code.md', 'CONTEXT.md']) expect(rules).toContain(file);
    expect(rules).toContain('Before you push, run `pnpm run check`');
    expect(rules).toContain('The browser tests can\'t run on this runner');
    expect(allowedTools(claude)).toEqual(
      expect.arrayContaining(['Bash(pnpm run check)', 'Bash(pnpm run verify:*)', 'Bash(pnpm exec tsc:*)', 'Bash(pnpm exec vitest:*)', 'Glob', 'Grep']),
    );
  });

  it('adds no attribution to its commits and pull requests', () => {
    expect(claude.with?.['settings']).toBe('{"attribution": {"commit": "", "pr": ""}}');
    expect(rules).toContain('carry no attribution');
  });

  it('stages files by path only, since the action resets .claude/ on a pull request and a blanket add would commit that reset', () => {
    for (const blanket of ['git add -A', 'git add --all', 'git add .', 'git add -u', 'git commit -a']) {
      expect(disallowedTools(claude).some((tool) => tool.startsWith(`Bash(${blanket}`)), blanket).toBe(true);
    }
    expect(rules).toContain('Stage only the files you changed, by path');
  });

  it('keeps subagents in the foreground, gives the checks time to finish, and caps the turns and the time', () => {
    expect(claude.env?.['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']).toBe('1');
    expect(claude.env?.['BASH_DEFAULT_TIMEOUT_MS']).toBe('900000');
    expect(claudeArgs).toContain('--max-turns 60');
    expect(claudeArgs).toContain('--model claude-sonnet-5-5');
    expect(claudeArgs).toContain('--strict-mcp-config');
    expect(job['timeout-minutes']).toBe(45);
  });

  it('checks the outcome afterwards, from when Claude started', () => {
    expect(guardIndex).toBeGreaterThan(claudeIndex);
    expect(guard.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}', CLAUDE_BOT: BOT });
    const start = steps.findIndex((step) => step.run?.includes('CLAUDE_STARTED_AT='));
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(claudeIndex);
  });
});

describe('the fork check before an @claude request', () => {
  const { step: source, index: sourceIndex } = stepNamed(steps, 'Skip a pull request from a fork');
  const runSource = (isPullRequest: boolean, pullRequest: Answer) =>
    runNodeStep(
      source,
      { ENTITY_NUMBER: '7', GITHUB_ENV: 'env.txt', GITHUB_REPOSITORY: REPOSITORY, IS_PR: isPullRequest ? 'true' : 'false' },
      (url) => (url.pathname === `/repos/${REPOSITORY}/pulls/7` ? pullRequest : undefined),
      { files: { 'env.txt': '' } },
    );
  const fromRepository = (name: string | null): Answer => ({ status: 200, body: { head: { repo: name === null ? null : { full_name: name } } } });

  it('runs before anything is checked out, and every later step but the check waits for it', () => {
    expect(sourceIndex).toBeLessThan(indexOfUses('actions/checkout'));
    expect(source.env?.['GITHUB_TOKEN']).toBe('${{ github.token }}');
    for (const step of steps.slice(sourceIndex + 1).filter((each) => each !== guard)) expect(step.if).toContain("env.ANSWER == 'true'");
  });

  it.each<[string, boolean, Answer, string]>([
    ['an issue', false, fromRepository('someone/fork'), 'ANSWER=true\n'],
    ["a pull request from this repository's branch", true, fromRepository(REPOSITORY), 'ANSWER=true\n'],
    ['a pull request from a fork', true, fromRepository('someone/serplists.com'), 'ANSWER=false\n'],
    ['a pull request from a deleted fork', true, fromRepository(null), 'ANSWER=false\n'],
  ])('decides whether to answer on %s', async (_what, isPullRequest, pullRequest, decision) => {
    const { status, files, requests } = await runSource(isPullRequest, pullRequest);

    expect(status).toBe(0);
    expect(files['env.txt']).toBe(decision);
    expect(requests).toHaveLength(isPullRequest ? 1 : 0);
  });

  it("fails, and answers nothing, when it can't read the pull request", async () => {
    const { status, output, files } = await runSource(true, { status: 404, body: {} });

    expect(status).not.toBe(0);
    expect(output).toContain('404');
    expect(files['env.txt']).toBe('');
  });
});

describe('the Node an @claude request sets up', () => {
  const { step: fallback, index: fallbackIndex } = stepNamed(steps, "Take Node's version from staging on a branch from before .node-version");
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
  const onABranchFromBeforeTheVersionFile = (answer: Answer) => {
    const checkout = mkdtempSync(path.join(tmpdir(), 'claude-node-'));
    folders.push(checkout);
    gitIn(checkout, 'init', '--quiet');
    gitIn(checkout, 'commit', '--quiet', '--allow-empty', '--message', 'Before the version file');
    const route: Route = (url) => (url.pathname === `/repos/${REPOSITORY}/contents/.node-version` && url.searchParams.get('ref') === 'staging' ? answer : undefined);
    return runNodeStep(fallback, { GITHUB_REPOSITORY: REPOSITORY, BASE_BRANCH: 'staging' }, route, { cwd: checkout }).then((run) => ({ ...run, checkout }));
  };

  it("is staging's on a branch from before .node-version: the workflow's file is main's, the checkout the branch's", () => {
    expect(String(elementAt(steps, indexOfUses('actions/checkout')).with?.['ref'])).toContain("format('refs/pull/{0}/head'");
    expect(fallbackIndex).toBeGreaterThan(indexOfUses('actions/checkout'));
    expect(fallbackIndex).toBeLessThan(indexOfUses('actions/setup-node'));
    expect(fallback.if).toBe("env.ANSWER == 'true' && hashFiles('.node-version') == ''");
    expect(elementAt(steps, indexOfUses('actions/setup-node')).with?.['node-version-file']).toBe('.node-version');
  });

  it("writes staging's version where setup-node reads it, and keeps it out of what Claude can commit", async () => {
    const { status, output, checkout } = await onABranchFromBeforeTheVersionFile({ status: 200, body: '22\n' });

    expect(status, output).toBe(0);
    expect(readFileSync(path.join(checkout, '.node-version'), 'utf8')).toBe('22\n');
    expect(gitIn(checkout, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    gitIn(checkout, 'add', '--all');
    expect(gitIn(checkout, 'diff', '--cached', '--name-only')).toBe('');
  });

  it("fails the job when staging's version can't be read", async () => {
    expect((await onABranchFromBeforeTheVersionFile({ status: 404, body: {} })).status).not.toBe(0);
  });
});

type Commit = { sha: string; author?: string; at?: string; message?: string; files?: string[] };

const github =
  (commits: Commit[]): Route =>
  (url) => {
    if (url.pathname === `/repos/${REPOSITORY}/pulls/7`) return { status: 200, body: { head: { ref: 'fl/feature', sha: 'headsha' } } };
    if (url.pathname === `/repos/${REPOSITORY}/commits`) {
      return {
        status: 200,
        body: commits.map((item) => ({
          sha: item.sha,
          commit: { author: { name: item.author ?? BOT, date: item.at ?? minutesAfterStart(5) }, message: item.message ?? 'fix: rename the helper' },
        })),
      };
    }
    const commit = commits.find((item) => url.pathname === `/repos/${REPOSITORY}/commits/${item.sha}`);
    return commit ? { status: 200, body: { files: (commit.files ?? []).map((filename) => ({ filename })) } } : undefined;
  };

const runGuard = (log: unknown, { onPullRequest = true, commits = [] }: { onPullRequest?: boolean; commits?: Commit[] } = {}) => {
  const { env, files } = executionLog(log);
  return runNodeStep(
    guard,
    {
      ...env,
      CLAUDE_BOT: BOT,
      CLAUDE_BRANCH: onPullRequest ? '' : 'claude/issue-12-20261004',
      CLAUDE_STARTED_AT: STARTED_AT,
      ENTITY_NUMBER: onPullRequest ? '7' : '12',
      GITHUB_REPOSITORY: REPOSITORY,
      IS_PR: onPullRequest ? 'true' : 'false',
    },
    github(commits),
    { files },
  );
};

const result = claudeResult({
  num_turns: 18,
  duration_ms: 240_000,
  total_cost_usd: 0.9,
  modelUsage: { 'claude-sonnet-5-5': {} },
  result: 'Renamed the helper and pushed abc1234.',
});
const replied = [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_reply', name: 'mcp__github_comment__update_claude_comment' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_reply', is_error: false }] } },
];
const pushedByClaude: Commit = { sha: 'abc1234aaa' };

describe('the check after an @claude request', () => {
  it('fails unless Claude finished: no log, no result, an error, a refused token, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished((log) => runGuard(log), result);
  });

  it('passes when Claude answered in its comment', async () => {
    const { status, output } = await runGuard([...replied, result()]);

    expect(output).toContain('Claude replied in its comment.');
    expect(output).not.toContain('::error');
    expect(status).toBe(0);
  });

  it('passes when Claude pushed to the pull request and replied', async () => {
    const { status, output } = await runGuard([...replied, result()], { commits: [pushedByClaude] });

    expect(output).toContain('pushed 1 commit(s) to fl/feature and replied in its comment');
    expect(output).not.toContain('::warning');
    expect(status).toBe(0);
  });

  it('ignores commits by anyone else, or from before the request', async () => {
    const { status, output } = await runGuard([result({ result: "I couldn't reproduce it." })], {
      commits: [{ sha: 'personal1', author: 'Francis LaBounty' }, { sha: 'earlier1', at: minutesAfterStart(-10) }],
    });

    expect(output).toContain('Claude neither pushed a commit nor updated its comment.');
    expect(output).toContain("I couldn't reproduce it.");
    expect(status).not.toBe(0);
  });

  it('fails when Claude pushed a commit with attribution', async () => {
    const { status, output } = await runGuard([...replied, result()], {
      commits: [{ sha: 'abc1234aaa', message: 'fix: rename\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }],
    });

    expect(output).toContain('with attribution in the commit message');
    expect(status).not.toBe(0);
  });

  it('warns when Claude changed a file the action resets on a pull request, and when it pushed without replying', async () => {
    const { status, output } = await runGuard([result()], { commits: [{ sha: 'abc1234aaa', files: ['.claude/settings.json'] }] });

    expect(output).toContain('Claude changed files the action resets');
    expect(output).toContain('.claude/settings.json in abc1234');
    expect(output).toContain("Claude didn't reply");
    expect(status).toBe(0);
  });

  it("reads the branch Claude made for an issue, not a pull request's", async () => {
    const { status, output } = await runGuard([...replied, result()], { onPullRequest: false, commits: [pushedByClaude] });

    expect(output).toContain('pushed 1 commit(s) to claude/issue-12-20261004');
    expect(status).toBe(0);
  });
});
