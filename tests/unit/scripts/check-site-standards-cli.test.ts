import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runRepositoryScript, runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';
import { runScriptProcess } from '../../support/scriptProcess';
import { aCertificateForLocalhost } from '../../support/selfSignedCertificate';
import { deployedWorkerWithTheBuiltRedirects, servedOverHttp, servedOverHttps } from '../../support/siteFollowingTheStandards';
import { TIMERS_THAT_DO_NOT_WAIT, timersThatDoNotWaitEnv } from '../../support/timersThatDoNotWait';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const SCRIPT = 'scripts/check-site-standards.ts';
const workDir = aWorkDirRemovedAfterAll('check-site-standards-cli-');

describe('node scripts/check-site-standards.ts, as the deploy workflows run it', () => {
  it('passes a local build that follows the standards over HTTP, printing each check, and exits 0', { timeout: 60_000 }, async () => {
    const site = await deployedWorkerWithTheBuiltRedirects('production');

    const result = await servedOverHttp(site, (origin) => runRepositoryScriptWhileServing(SCRIPT, [origin, 'production', '--local']));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ok   /pricing on www.serplists.com -> 308 https://serplists.com/pricing/');
    expect(result.stdout).toMatch(/\n\d+ passed, 0 failed\n$/);
  });

  it('checks a deployment over https, asks twice more when a check fails, then fails, printing each check and exiting 1', { timeout: 120_000 }, async () => {
    const site = await deployedWorkerWithTheBuiltRedirects('production', { brokenApi: true });
    const certificate = aCertificateForLocalhost();
    const trusted = path.join(workDir, 'localhost.pem');
    writeFileSync(trusted, certificate.cert);

    const result = await servedOverHttps(site, certificate, (origin) =>
      runScriptProcess(SCRIPT, {
        args: [origin, 'production'],
        env: { ...process.env, NODE_EXTRA_CA_CERTS: trusted, ...timersThatDoNotWaitEnv },
        preloads: [TIMERS_THAT_DO_NOT_WAIT],
      }),
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
    const waitingLines = result.stdout.split('\n').filter((line) => line.includes('checking again in 20s'));
    expect(waitingLines).toEqual([2, 3].map((attempt) => `1 check(s) failed; a new deployment can answer 404 or not answer at all for its first seconds, so checking again in 20s (attempt ${attempt} of 3).`));
    expect(result.stdout).toContain('\nok   200 /pricing/\n');
    expect(result.stdout).toContain('\nFAIL 308 /api/health/ (the API is never redirected)\n');
    expect(result.stdout).toMatch(/\n\d+ passed, 1 failed\n$/);
  });

  it.each([
    [[], 2, 'usage: node --import tsx scripts/check-site-standards.ts <base-url> <staging|production> [--local]'],
    [['https://example.test'], 2, 'usage:'],
    [['https://example.test', 'preview'], 1, 'Unknown environment preview: use staging or production'],
  ])('refuses the arguments %j', { timeout: 60_000 }, async (args, status, message) => {
    const result = await runRepositoryScript(SCRIPT, args);

    expect(result.status).toBe(status);
    expect(result.stderr).toContain(message);
  });
});
