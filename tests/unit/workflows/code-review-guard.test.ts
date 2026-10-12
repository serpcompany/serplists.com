import { describe, expect, it } from 'vitest';

import { claudeResult, deniedCommand, executionLog, expectFailureUnlessClaudeFinished, runNodeStep } from '../../support/claudeWorkflows';
import {
  CLAUDE_BOT,
  environment,
  github,
  guard,
  guardIndex,
  minutesAfterStart,
  type PullRequest,
  requestReply,
  REVIEW_BOT,
  reviewIndex,
  steps,
  summaryBody,
  summaryOf,
} from '../../support/codeReviewWorkflow';

const runGuard = (log: unknown, pullRequest: PullRequest = {}, written: Record<string, string> = {}) => {
  const { env, files } = executionLog(log);
  return runNodeStep(guard, { ...environment, ...env, SUMMARY_FILE: 'tmp/review-summary.md' }, github(pullRequest), {
    files: { ...files, ...written },
  });
};

const result = claudeResult({
  num_turns: 24,
  duration_ms: 312_000,
  total_cost_usd: 2.4,
  modelUsage: { 'claude-sonnet-5-5': {} },
  result: 'Wrote 2 findings and the summary.',
});
const reviewer = (description: string, name = 'Task') => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name, input: { description } }] },
});
const threeReviewers = [reviewer('Bugs'), reviewer('Rules'), reviewer('The issue, tests, and docs')];
const cleanLog = [{ type: 'system', subtype: 'init' }, ...threeReviewers, result()];
const summaryPosted = (coverage: string): PullRequest => ({
  issueComments: [{ login: REVIEW_BOT, at: minutesAfterStart(4), details: summaryOf(coverage) }],
});
const deniedView = deniedCommand('gh pr view 7 --comments');

describe("the review's guard", () => {
  it('runs after the review, from when it started, even when the review step failed', () => {
    expect(guardIndex).toBeGreaterThan(reviewIndex);
    expect(guard.if).toBe("${{ !cancelled() && steps.review.outcome != 'skipped' }}");
    expect(guard.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}', REVIEW_BOT, SUMMARY_FILE: 'tmp/review-summary.md' });
    const start = steps.findIndex((step) => step.run?.includes('REVIEW_STARTED_AT='));
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(reviewIndex);
  });

  it('fails unless Claude finished: no log, no result, an error, a refused token, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished((log) => runGuard(log), result);
  });

  it('fails when nothing was posted, saying whether Claude wrote its summary and what it said last', async () => {
    const { status, output } = await runGuard([...threeReviewers, result({ result: 'This only bumps a version, so it needs no review.' })], {
      issueComments: [{ login: 'someone', at: minutesAfterStart(3) }],
    });

    expect(status).not.toBe(0);
    expect(output).toContain('Nothing was posted on the pull request. Claude wrote no tmp/review-summary.md.');
    expect(output).toContain('needs no review');
  });

  it('fails and names the command when Claude was denied a tool and nothing was posted', async () => {
    const { status, output } = await runGuard([...threeReviewers, result(deniedView)], {}, { 'tmp/review-summary.md': summaryBody.body });

    expect(status).not.toBe(0);
    expect(output).toContain('gh pr view 7 --comments');
    expect(output).not.toContain('Claude wrote no');
  });

  it("fails when it can't read the pull request", async () => {
    const { status, output } = await runGuard(cleanLog, { status: 403 });

    expect(status).not.toBe(0);
    expect(output).toContain('403');
  });

  it.each<[string, PullRequest]>([
    ['a summary comment', { issueComments: [{ login: REVIEW_BOT, at: minutesAfterStart(4), details: summaryBody }] }],
    ['a summary that names the files it left out', { changedFiles: 6, ...summaryPosted('Read 4 of 6 changed files.\nNot read: pnpm-lock.yaml and public/logo.png (not text).') }],
    ['a summary that counts one file', { changedFiles: 1, ...summaryPosted('Read 1 of 1 changed file.') }],
    ['a summary whose count is a list item', summaryPosted('- Read 4 of 4 changed files.')],
    ['a summary whose count is in bold', summaryPosted('**Read 4 of 4 changed files.**')],
    ['an update to its summary', { issueComments: [{ login: REVIEW_BOT, at: minutesAfterStart(-90), updatedAt: minutesAfterStart(4), details: summaryBody }] }],
  ])('passes when three reviewers ran and the workflow posted %s during the run', async (_what, pullRequest) => {
    const { status, output } = await runGuard(cleanLog, pullRequest);

    expect(output).not.toContain('::error');
    expect(output).toContain('about $2.40');
    expect(output).toContain('Claude started 3 reviewers');
    expect(status).toBe(0);
  });

  it('counts a reviewer whichever name the tool that starts it has', async () => {
    const log = [reviewer('Bugs', 'Agent'), reviewer('Rules', 'Agent'), reviewer('Docs'), result()];

    expect((await runGuard(log, summaryPosted('Read 4 of 4 changed files.'))).status).toBe(0);
  });

  it.each([
    ['none', [result()], 'started 0 of'],
    ['two', [reviewer('Bugs'), reviewer('Rules'), result()], 'started 2 of'],
  ])('fails when Claude started %s of the three reviewers, though the summary was posted', async (_count, log, message) => {
    const { status, output } = await runGuard(log, summaryPosted('Read 4 of 4 changed files.'));

    expect(status).not.toBe(0);
    expect(output).toContain(message);
  });

  it.each<[string, PullRequest, string]>([
    ['findings and no summary', { reviewComments: [{ login: REVIEW_BOT, at: minutesAfterStart(5) }] }, 'no summary'],
    ['no line saying what it read', summaryPosted('No coverage here.'), 'has no "Read'],
    ["a file count that isn't the pull request's", { changedFiles: 61, ...summaryPosted('Read 2 of 2 changed files.') }, 'counts 2 changed files, and the pull request changes 61'],
    ['unread files it does not name', { changedFiles: 61, ...summaryPosted('Read 2 of 61 changed files.') }, 'names none of the rest'],
    ['more files read than changed', summaryPosted('Read 5 of 4 changed files.'), '5 of 4'],
  ])('fails when the review left %s', async (_what, pullRequest, message) => {
    const { status, output } = await runGuard(cleanLog, pullRequest);

    expect(status).not.toBe(0);
    expect(output).toContain(message);
  });

  it("doesn't count Claude's reply to an @claude request, or in a review thread, as the review", async () => {
    const { status, output } = await runGuard(cleanLog, {
      issueComments: [{ login: CLAUDE_BOT, at: minutesAfterStart(3), details: requestReply }],
      reviewComments: [{ login: CLAUDE_BOT, at: minutesAfterStart(4), details: { in_reply_to_id: 11, body: 'Fixed in abc1234.' } }],
    });

    expect(output).toContain('::error');
    expect(status).not.toBe(0);
  });

  it("doesn't count a summary that the workflow didn't post", async () => {
    const { status } = await runGuard(cleanLog, {
      issueComments: [
        { login: CLAUDE_BOT, at: minutesAfterStart(3), details: summaryBody },
        { login: 'someone', at: minutesAfterStart(4), details: summaryBody },
      ],
    });

    expect(status).not.toBe(0);
  });

  it('warns but passes when Claude was denied a tool and the review was still posted', async () => {
    const { status, output } = await runGuard([...threeReviewers, result(deniedView)], summaryPosted('Read 4 of 4 changed files.'));

    expect(output).toContain('::warning');
    expect(status).toBe(0);
  });

  it('fails when only an earlier push was reviewed', async () => {
    const { status } = await runGuard(cleanLog, {
      reviewComments: [{ login: REVIEW_BOT, at: minutesAfterStart(-90) }],
      issueComments: [{ login: REVIEW_BOT, at: minutesAfterStart(-90), details: summaryBody }],
    });

    expect(status).not.toBe(0);
  });
});
