import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildScriptInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';
import { SIGN_IN_PATH } from '../../../scripts/verify-deployment-lib';
import { stringContaining } from '../../support/asymmetricMatchers';
import { unlinkWithoutFollowing } from '../../support/checkoutCopy';
import { whileServingLocally } from '../../support/localHttpServer';
import { runRepositoryScript, runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';
import { ranToTheEnd } from '../../support/scriptProcess';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const COMMIT = '07ec182950550883a30578a6e5b50658f1134ed7';
const SCRIPT = 'scripts/verify-deployment.ts';
const WITHOUT_INPUTS = { ...process.env, DEPLOY_URL: undefined, RELEASE_COMMIT: undefined, SITE_ENV: undefined };
const workDir = aWorkDirRemovedAfterAll('verify-deployment-cli-');

const ANSWERS: Record<string, { status: number; body: string }> = {
  'GET /api/health': { status: 200, body: JSON.stringify({ status: 'ok', release: { commit: COMMIT, environment: 'staging' } }) },
  'GET /api/templates': { status: 200, body: '{"templates":[]}' },
  'GET /about/': { status: 200, body: `<html><head><meta name="serplists-release" content="${COMMIT}"></head></html>` },
  [`POST ${SIGN_IN_PATH}`]: { status: 401, body: '{"code":"INVALID_EMAIL_OR_PASSWORD"}' },
};

const aDeploymentServing = <T>(run: (origin: string) => Promise<T>): Promise<T> =>
  whileServingLocally((incoming, outgoing) => {
    incoming.resume();
    incoming.on('end', () => {
      const answer = ANSWERS[`${incoming.method ?? 'GET'} ${incoming.url ?? '/'}`] ?? { status: 404, body: '' };
      outgoing.writeHead(answer.status).end(answer.body);
    });
  }, run);

describe('node scripts/verify-deployment.ts, as the deploy workflows run it', { timeout: 60_000 }, () => {
  it('passes a deployment that answers every probe, printing each, and exits 0', async () => {
    const result = await aDeploymentServing((origin) =>
      runRepositoryScriptWhileServing(SCRIPT, [], { env: { ...process.env, DEPLOY_URL: `${origin}/`, RELEASE_COMMIT: COMMIT, SITE_ENV: 'staging' } }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').filter(Boolean)).toEqual([
      stringContaining(`/api/health -> 200, commit ${COMMIT}, staging`),
      stringContaining('/api/templates -> 200'),
      stringContaining(`/about/ -> 200, release ${COMMIT}`),
      stringContaining(`${SIGN_IN_PATH} -> 401: a made-up account with a wrong password is refused`),
    ]);
  });

  it('exits 1 when the workflow passes none of its inputs', async () => {
    const result = await runRepositoryScript(SCRIPT, [], { env: WITHOUT_INPUTS });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::The smoke test needs DEPLOY_URL, RELEASE_COMMIT and SITE_ENV');
  });

  it('runs, rather than doing nothing and passing, when started through a linked folder, as a checkout reached through a junction is', async () => {
    const linked = path.join(workDir, 'checkout');
    symlinkSync(REPO_ROOT, linked, 'junction');
    try {
      const { command, args } = buildScriptInvocation(path.join(linked, SCRIPT));
      const result = await ranToTheEnd(command, args, { cwd: REPO_ROOT, env: WITHOUT_INPUTS });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('::error::The smoke test needs DEPLOY_URL, RELEASE_COMMIT and SITE_ENV');
    } finally {
      await unlinkWithoutFollowing(linked);
    }
  });
});
