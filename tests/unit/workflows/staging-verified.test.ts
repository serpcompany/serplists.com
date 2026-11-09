import { describe, expect, it } from 'vitest';

import { nodeOptionsWithAFetchStandIn, type FetchAnswer } from '../../support/fetchStandIn';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runAgainstAGitHubStandIn, type Route } from '../../support/githubApiStandIn';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const REPOSITORY = 'serpcompany/serplists.com';
const MAIN_COMMIT = '0fad76c2a08d3d0c75c6a0f010b9005ad1e42e8c';
const TREE = '9b6a339be284ed7ebc1f88954bc2a9e64973531e';
const OTHER_TREE = '56e8b704a9b547d6ed02d7921e7a7858cd8d24de';
const DEPLOY = 'Deploy staging / deploy';
const RUNS = `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs`;

type Job = { name: string; status: string; conclusion: string | null };
type StagingRun = { number: number; tree: string; jobs: Job[] };

const finished = (name: string, conclusion: string): Job => ({ name, status: 'completed', conclusion });
const stagingRun = (number: number, tree: string, jobs: Job[]): StagingRun => ({ number, tree, jobs });
const passedItsDeploy = (number: number, tree = TREE) =>
  stagingRun(number, tree, [finished('Quality Gate', 'success'), finished(DEPLOY, 'success')]);

const github =
  (runs: StagingRun[], refuse = false): Route =>
  ({ path }) => {
    if (path === `/repos/${REPOSITORY}/git/commits/${MAIN_COMMIT}`) return { status: 200, body: { sha: MAIN_COMMIT, tree: { sha: TREE } } };
    if (path === RUNS && refuse) return { status: 403, body: { message: 'Resource not accessible by integration' } };
    if (path === RUNS) {
      const listed = runs.map((run) => ({
        id: 7000 + run.number,
        run_number: run.number,
        head_sha: `${run.number}`.padEnd(40, 'a'),
        head_commit: { tree_id: run.tree },
        html_url: `https://github.com/${REPOSITORY}/actions/runs/${7000 + run.number}`,
      }));
      return { status: 200, body: { workflow_runs: listed } };
    }
    const run = runs.find((each) => path === `/repos/${REPOSITORY}/actions/runs/${7000 + each.number}/jobs`);
    return run ? { status: 200, body: { jobs: run.jobs } } : undefined;
  };

const gateWith = (route: Route, env: Record<string, string> = {}) =>
  runAgainstAGitHubStandIn(
    { script: '.github/actions/staging-verified/staging-verified.cjs' },
    { GITHUB_REPOSITORY: REPOSITORY, GITHUB_SHA: MAIN_COMMIT, WORKFLOW: 'ci.yml', JOB: DEPLOY, BRANCH: 'staging', ...env },
    route,
  );

const gate = (runs: StagingRun[], refuse = false) => gateWith(github(runs, refuse));

describe('the staging-verified action, which lets Production deploy only files Staging has deployed and checked', () => {
  it("passes when a push run on staging built main's tree and its staging deploy passed, naming that run", async () => {
    const { status, output, requests } = await gate([passedItsDeploy(240, OTHER_TREE), passedItsDeploy(238)]);

    expect(status).toBe(0);
    expect(output).toContain('Staging deployed and checked these files in run 238');
    expect(output).toContain(`https://github.com/${REPOSITORY}/actions/runs/7238`);
    const runsRequest = requests.find((request) => request.path === RUNS);
    expect([runsRequest?.query.get('branch'), runsRequest?.query.get('event')]).toEqual(['staging', 'push']);
    expect(requests.filter((request) => request.path.endsWith('/jobs')).map((request) => request.query.get('filter'))).toEqual(['latest']);
  });

  it('passes when an earlier run of the same files passed, though a later one of them failed', async () => {
    const failedAgain = stagingRun(239, TREE, [finished(DEPLOY, 'failure')]);

    expect((await gate([failedAgain, passedItsDeploy(238)])).status).toBe(0);
  });

  it('fails when staging never built these files, as for a change pushed straight to main, and says how to promote', async () => {
    const { status, output } = await gate([passedItsDeploy(240, OTHER_TREE)]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error title=Staging has not deployed these files::');
    expect(output).toContain(`built tree ${TREE}`);
    expect(output).toContain('pnpm run promote:prepare');
  });

  it.each<[string, Job[], string]>([
    ['failed', [finished('Quality Gate', 'success'), finished(DEPLOY, 'failure')], 'run 238: failure'],
    ['is still running', [{ name: DEPLOY, status: 'in_progress', conclusion: null }], 'run 238: in_progress'],
    ['never ran, after its checks failed', [finished('Quality Gate', 'failure'), finished(DEPLOY, 'skipped')], 'run 238: skipped'],
    ['has no deploy job', [finished('Quality Gate', 'success')], 'run 238: no such job'],
  ])("fails when staging's deploy of these files %s", async (_case, jobs, result) => {
    const { status, output } = await gate([stagingRun(238, TREE, jobs)]);

    expect(status).not.toBe(0);
    expect(output).toContain('::error title=Staging has not passed its deploy of these files::');
    expect(output).toContain(result);
  });

  it('fails, deploying nothing, when GitHub refuses the runs', async () => {
    const { status, output } = await gate([passedItsDeploy(238)], true);

    expect(status).not.toBe(0);
    expect(output).toContain("::error title=Couldn't tell whether Staging deployed these files::");
    expect(output).toContain('/actions/workflows/ci.yml/runs returned 403');
  });
});

describe('the staging-verified action, given answers it cannot read', () => {
  const answering = (path: string, body: unknown): Route => (request) =>
    request.path === path ? { status: 200, body } : github([stagingRun(238, TREE, [finished(DEPLOY, 'success')])])(request);

  it.each<[string, string, unknown, string]>([
    ['a commit without a tree', `/repos/${REPOSITORY}/git/commits/${MAIN_COMMIT}`, { sha: MAIN_COMMIT }, `GitHub named no tree for commit ${MAIN_COMMIT}`],
    ['runs that are not a list', RUNS, { total_count: 0 }, 'GitHub listed no runs of ci.yml'],
    ['jobs that are not a list', `/repos/${REPOSITORY}/actions/runs/7238/jobs`, { total_count: 0 }, 'GitHub listed no jobs for run 238'],
  ])('fails, deploying nothing, on %s', async (_case, path, body, message) => {
    const { status, output } = await gateWith(answering(path, body));

    expect(status).not.toBe(0);
    expect(output).toContain(`::error title=Couldn't tell whether Staging deployed these files::${message}`);
  });

  it('fails without asking GitHub when it is not told which branch Staging deploys', async () => {
    const { status, output, requests } = await gateWith(github([]), { BRANCH: '' });

    expect(status).not.toBe(0);
    expect(output).toContain('WORKFLOW, JOB, BRANCH and GITHUB_SHA must be set.');
    expect(requests).toEqual([]);
  });
});

describe('the staging-verified action on a runner that names no GitHub API URL', () => {
  const workDir = aWorkDirRemovedAfterAll('staging-verified-');
  const commitOnGitHub = `https://api.github.com/repos/${REPOSITORY}/git/commits/${MAIN_COMMIT}`;
  const gateAnsweredBy = (answer: FetchAnswer) =>
    gateWith(github([]), { GITHUB_API_URL: '', NODE_OPTIONS: nodeOptionsWithAFetchStandIn(aFolderIn(workDir), { [commitOnGitHub]: answer }) });

  it('asks api.github.com for the commit it checks', { timeout: 120_000 }, async () => {
    const { status, output, requests } = await gateAnsweredBy({ status: 200, body: JSON.stringify({ sha: MAIN_COMMIT }) });

    expect(status).not.toBe(0);
    expect(output).toContain(`::error title=Couldn't tell whether Staging deployed these files::GitHub named no tree for commit ${MAIN_COMMIT}`);
    expect(requests).toEqual([]);
  });

  it('reports a request that cannot reach GitHub by the error fetch fails with', { timeout: 120_000 }, async () => {
    const { status, output } = await gateAnsweredBy({ unreachable: 'getaddrinfo ENOTFOUND api.github.com' });

    expect(status).not.toBe(0);
    expect(output).toContain("::error title=Couldn't tell whether Staging deployed these files::fetch failed");
  });
});
