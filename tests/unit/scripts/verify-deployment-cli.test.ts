import { describe, expect, it } from 'vitest';

import { SIGN_IN_PATH } from '../../../scripts/verify-deployment-lib';
import { stringContaining } from '../../support/asymmetricMatchers';
import { whileServingLocally } from '../../support/localHttpServer';
import { runRepositoryScript, runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';

const COMMIT = '07ec182950550883a30578a6e5b50658f1134ed7';
const SCRIPT = 'scripts/verify-deployment.ts';

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

  it('exits 1 when the workflow passes none of its inputs', () => {
    const result = runRepositoryScript(SCRIPT, [], { env: { ...process.env, DEPLOY_URL: undefined, RELEASE_COMMIT: undefined, SITE_ENV: undefined } });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::The smoke test needs DEPLOY_URL, RELEASE_COMMIT and SITE_ENV');
  });
});
