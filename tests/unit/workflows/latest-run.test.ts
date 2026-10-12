import { describe, expect, it } from 'vitest';

import { runAgainstAGitHubStandIn, type Route } from '../../support/githubApiStandIn';

const REPOSITORY = 'serpcompany/serplists.com';
const RUNS = `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs`;
const STAGING = 'Deploy staging / deploy';
const PRODUCTION = 'Deploy production / deploy';

type Job = { name: string; status: string; conclusion: string | null; steps?: object[] };
type Run = { id: number; run_number: number; status: string; conclusion?: string; event: string; run_attempt: number; jobs: Job[] };

const done = (name: string, conclusion = 'success'): Job => ({ name, status: 'completed', conclusion, steps: [{ name: 'Set up job' }] });
const aRun = (number: number, jobs: Job[] = [], changes: Partial<Run> = {}): Run => ({
  id: 9000 + number,
  run_number: number,
  status: 'completed',
  event: 'push',
  run_attempt: 1,
  jobs,
  ...changes,
});
const thisRun = aRun(41, [], { status: 'in_progress' });

const github =
  (runs: Run[], refuse?: 'runs' | 'jobs'): Route =>
  ({ path }) => {
    const refused = { status: 403, body: { message: 'Resource not accessible by integration' } };
    if (path === RUNS) return refuse === 'runs' ? refused : { status: 200, body: { workflow_runs: runs } };
    const listed = runs.find((run) => path === `/repos/${REPOSITORY}/actions/runs/${run.id}/jobs`);
    if (!listed) return undefined;
    return refuse === 'jobs' ? refused : { status: 200, body: { jobs: listed.jobs } };
  };

const guard = (job: string, runs: Run[], { refuse, env = {} }: { refuse?: 'runs' | 'jobs'; env?: Record<string, string> } = {}) =>
  runAgainstAGitHubStandIn(
    { script: '.github/actions/latest-run/latest-run.cjs' },
    { GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF_NAME: 'staging', GITHUB_RUN_NUMBER: '41', WORKFLOW: 'ci.yml', JOB: job, ...env },
    github(runs, refuse),
  );

describe('the latest-run action, which stops an old run started again from deploying over a newer one', () => {
  it("passes the latest run, asking only for the branch's runs", async () => {
    const { status, output, requests } = await guard(STAGING, [thisRun, aRun(40, [done(STAGING)])]);

    expect(output).toBe('');
    expect(status).toBe(0);
    expect(requests.map((request) => request.path)).toEqual([RUNS]);
    expect(requests[0]?.query.get('branch')).toBe('staging');
  });

  it('passes while a later run only waits behind this one, asking for none of its jobs', async () => {
    const { status, requests } = await guard(STAGING, [aRun(42, [], { status: 'pending' }), thisRun]);

    expect(status).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it('fails a deploy job a later run has already run, saying which run and why', async () => {
    const { status, output } = await guard(STAGING, [aRun(42, [done(STAGING)]), thisRun]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error title=A later run has already run this job::');
    expect(output).toContain(`run 42 on staging, which is later, has already run its "${STAGING}" job`);
  });

  it.each<[string, Run]>([
    ['is running it now', aRun(42, [{ name: STAGING, status: 'in_progress', conclusion: null }])],
    ['failed in it', aRun(42, [done(STAGING, 'failure')])],
    ['was cancelled part way through it', aRun(42, [done(STAGING, 'cancelled')])],
    ['was started by hand', aRun(42, [done(STAGING)], { event: 'workflow_dispatch' })],
    ['ran it, then was started again and waits', aRun(42, [done(STAGING)], { status: 'pending', run_attempt: 2 })],
  ])('fails when a later run %s', async (_case, later) => {
    expect((await guard(STAGING, [later, thisRun])).status).not.toBe(0);
  });

  it.each<[string, string, Run]>([
    ['deployed the other environment only', PRODUCTION, aRun(42, [done(STAGING), done(PRODUCTION, 'skipped')])],
    ['failed its checks before it reached this job', STAGING, aRun(42, [done('Quality Gate', 'failure'), done(STAGING, 'skipped')])],
    ['was replaced while it waited, with no job run', STAGING, aRun(42, [], { conclusion: 'cancelled' })],
    ['had this job cancelled before it started', STAGING, aRun(42, [{ name: STAGING, status: 'completed', conclusion: 'cancelled', steps: [] }])],
    ["was a pull request's", STAGING, aRun(43, [done(STAGING)], { event: 'pull_request' })],
  ])('passes when the later run %s', async (_case, job, later) => {
    const { status, output } = await guard(job, [later, thisRun]);

    expect(output).toBe('');
    expect(status).toBe(0);
  });

  it.each<[string, 'runs' | 'jobs', string]>([
    ['the runs', 'runs', '/actions/workflows/ci.yml/runs returned 403'],
    ["a later run's jobs", 'jobs', '/actions/runs/9042/jobs returned 403'],
  ])('fails, deploying nothing, when GitHub refuses %s', async (_case, refuse, message) => {
    const { status, output } = await guard(STAGING, [aRun(42, [done(STAGING)]), thisRun], { refuse });

    expect(status).not.toBe(0);
    expect(output).toContain("::error title=Couldn't tell whether a later run exists::");
    expect(output).toContain(message);
  });

  it('fails when it is not told which job deploys', async () => {
    const { status, output } = await guard('', [thisRun]);

    expect(status).not.toBe(0);
    expect(output).toContain('WORKFLOW, JOB, GITHUB_REF_NAME and GITHUB_RUN_NUMBER must be set.');
  });
});
