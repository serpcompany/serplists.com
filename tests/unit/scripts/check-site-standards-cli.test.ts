import { describe, expect, it } from 'vitest';

import { runRepositoryScript, runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';
import { deployedWorkerWithTheBuiltRedirects, servedOverHttp } from '../../support/siteFollowingTheStandards';

const SCRIPT = 'scripts/check-site-standards.ts';

describe('node scripts/check-site-standards.ts, as the deploy workflows run it', () => {
  it('passes a local build that follows the standards over HTTP, printing each check, and exits 0', { timeout: 60_000 }, async () => {
    const site = await deployedWorkerWithTheBuiltRedirects('production');

    const result = await servedOverHttp(site, (origin) => runRepositoryScriptWhileServing(SCRIPT, [origin, 'production', '--local']));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ok   /pricing on www.serplists.com -> 308 https://serplists.com/pricing/');
    expect(result.stdout).toMatch(/\n\d+ passed, 0 failed\n$/);
  });

  it.each([
    [[], 2, 'usage: node --import tsx scripts/check-site-standards.ts <base-url> <staging|production> [--local]'],
    [['https://example.test'], 2, 'usage:'],
    [['https://example.test', 'preview'], 1, 'Unknown environment preview: use staging or production'],
  ])('refuses the arguments %j', { timeout: 60_000 }, (args, status, message) => {
    const result = runRepositoryScript(SCRIPT, args);

    expect(result.status).toBe(status);
    expect(result.stderr).toContain(message);
  });
});
