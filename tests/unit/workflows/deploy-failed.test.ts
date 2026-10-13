import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runAgainstAGitHubStandIn, type Route, type SentRequest } from '../../support/githubApiStandIn';

const REPOSITORY = 'serpcompany/serplists.com';
const ISSUES = `/repos/${REPOSITORY}/issues`;
const COMMIT = '07ec182950550883a30578a6e5b50658f1134ed7';
const RUN_LINK = `https://github.com/${REPOSITORY}/actions/runs/37590564112/attempts/2`;

type OpenIssue = { number: number; title: string; pull_request?: object };

const openedIssue = z.object({ title: z.string(), labels: z.array(z.string()), body: z.string() });
const comment = z.object({ body: z.string() });
const sentJson = (request: SentRequest | undefined): unknown => JSON.parse(request?.body ?? 'null');

const github =
  (open: OpenIssue[], refuseWrites = false): Route =>
  ({ method, path }) => {
    if (method === 'GET' && path === ISSUES) {
      return { status: 200, body: open.map((issue) => ({ ...issue, html_url: `https://github.com/${REPOSITORY}/issues/${issue.number}` })) };
    }
    if (method !== 'POST') return undefined;
    if (refuseWrites) return { status: 403, body: { message: 'Resource not accessible by integration' } };
    if (path === ISSUES) return { status: 201, body: { number: 301, html_url: `https://github.com/${REPOSITORY}/issues/301` } };
    return /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/.test(path) ? { status: 201, body: { id: 1 } } : undefined;
  };

const report = (environment: string, open: OpenIssue[] = [], refuseWrites = false) =>
  runAgainstAGitHubStandIn(
    { script: '.github/actions/deploy-failed/deploy-failed.cjs' },
    {
      ENVIRONMENT: environment,
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_RUN_ID: '37590564112',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: COMMIT,
    },
    github(open, refuseWrites),
  );

describe('the deploy-failed action, which tells people a deploy failed', () => {
  it('opens one issue for the environment, labelled bug, naming the commit and linking the run', async () => {
    const { status, output, requests } = await report('staging');
    const listed = requests.find((request) => request.method === 'GET');
    const opened = openedIssue.parse(sentJson(requests.find((request) => request.method === 'POST')));

    expect(status).toBe(0);
    expect([listed?.query.get('state'), listed?.query.get('labels')]).toEqual(['open', 'bug']);
    expect(opened.title).toBe('Staging deploy failed');
    expect(opened.labels).toEqual(['bug']);
    expect(opened.body).toContain(`The staging deploy of 07ec182 failed: ${RUN_LINK}`);
    expect(opened.body).toContain('A failed check skips the deploy: docs/agents/ci.md says what each check runs, and docs/agents/ci-deploys.md');
    expect(output).toContain('Opened #301');
  });

  it('adds the run to the open issue for the environment instead of opening another', async () => {
    const open = [
      { number: 12, title: 'Staging deploy failed' },
      { number: 13, title: 'Production deploy failed', pull_request: {} },
      { number: 14, title: 'Production deploy failed' },
    ];
    const { status, requests } = await report('production', open);
    const posts = requests.filter((request) => request.method === 'POST');

    expect(status).toBe(0);
    expect(posts.map((request) => request.path)).toEqual([`${ISSUES}/14/comments`]);
    expect(comment.parse(sentJson(posts[0])).body).toBe(`The production deploy of 07ec182 failed: ${RUN_LINK}`);
  });

  it('fails without asking GitHub when it is not told which environment failed', async () => {
    const { status, output, requests } = await report('preview');

    expect(status).not.toBe(0);
    expect(output).toContain('ENVIRONMENT must be staging or production, not "preview".');
    expect(requests).toEqual([]);
  });

  it('fails, so the run shows red, when GitHub refuses to open the issue', async () => {
    const { status, output } = await report('production', [], true);

    expect(status).not.toBe(0);
    expect(output).toContain("::error title=Couldn't report the failed deploy::POST /issues returned 403");
  });
});
