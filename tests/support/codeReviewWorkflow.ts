import { claudeStep, guardAfter, minutesAfter, readWorkflow, type Route, stepsOf } from './claudeWorkflows';

export const workflow = readWorkflow('.github/workflows/code-review.yml');
export const steps = stepsOf(workflow, 'review');
export const { step: review, index: reviewIndex } = claudeStep(steps);
export const { step: guard, index: guardIndex } = guardAfter(steps, review);

export const REPOSITORY = 'serpcompany/serplists.com';
export const PR = '7';
export const REVIEW_BOT = 'github-actions[bot]';
export const CLAUDE_BOT = 'claude[bot]';
const STARTED_AT = '2026-10-01T10:00:00Z';

export const minutesAfterStart = (minutes: number) => minutesAfter(STARTED_AT, minutes);
export const summaryOf = (coverage: string) => ({ body: `## Claude review\nReviewed abc1234, round 1.\n${coverage}\n\nNo new findings.` });
export const summaryBody = summaryOf('Read 4 of 4 changed files.');
export const requestReply = { body: 'Done: I renamed the helper in abc1234.' };

type Posted = { login: string; at: string; updatedAt?: string; details?: Record<string, unknown> };

export type PullRequest = {
  issueComments?: Posted[];
  reviewComments?: Posted[];
  changedFiles?: number;
  body?: string;
  status?: number;
};

export function github(pullRequest: PullRequest): Route {
  const comments = (items: Posted[] = []) =>
    items.map(({ login, at, updatedAt, details }) => ({ user: { login }, created_at: at, updated_at: updatedAt ?? at, ...details }));
  const routes: Record<string, unknown> = {
    [`/repos/${REPOSITORY}/pulls/${PR}`]: { changed_files: pullRequest.changedFiles ?? 4, body: pullRequest.body ?? '' },
    [`/repos/${REPOSITORY}/issues/${PR}/comments`]: comments(pullRequest.issueComments),
    [`/repos/${REPOSITORY}/pulls/${PR}/comments`]: comments(pullRequest.reviewComments),
  };
  return (url, method) => {
    const body = routes[url.pathname];
    if (method !== 'GET' || body === undefined) return undefined;
    const status = pullRequest.status ?? 200;
    return { status, body: status === 200 ? body : { message: 'Not allowed' } };
  };
}

export const environment = { GITHUB_REPOSITORY: REPOSITORY, PR_NUMBER: PR, REVIEW_BOT, CLAUDE_BOT, REVIEW_STARTED_AT: STARTED_AT };
