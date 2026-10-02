import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildScriptInvocation } from '../../../scripts/lib/run-tool';

const SCRIPT = fileURLToPath(new URL('../../../scripts/check-env.ts', import.meta.url));
const cwdWithoutDevVars = mkdtempSync(path.join(tmpdir(), 'check-env-'));

function checkEnv(overrides: Record<string, string>) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    SystemRoot: process.env['SystemRoot'],
    NODE_ENV: 'test',
    AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    FRONTEND_URL: 'http://localhost:8080',
    CORS_ALLOWED_ORIGINS: 'http://localhost:8080',
  };
  Object.assign(env, overrides);
  const { command, args } = buildScriptInvocation(SCRIPT);
  return spawnSync(command, args, { cwd: cwdWithoutDevVars, env, encoding: 'utf8', timeout: 60_000 });
}

afterAll(() => rmSync(cwdWithoutDevVars, { recursive: true, force: true }));

describe('typecheck:env refuses before a deploy the origins the API refuses at runtime', { timeout: 60_000 }, () => {

  it.each<Record<string, string>>([
    { CORS_ALLOWED_ORIGINS: 'serplists.com' },
    { CORS_ALLOWED_ORIGINS: 'https://ok.com,localhost:8080' },
    { CORS_ALLOWED_ORIGINS: ' , ' },
    { CORS_ALLOWED_ORIGINS: '*' },
    { FRONTEND_URL: 'localhost:8080' },
  ])('fails for %j', (overrides) => {
    const result = checkEnv(overrides);

    expect(result.status).not.toBe(0);
  });

  it('passes for valid http(s) origins', () => {
    const result = checkEnv({
      FRONTEND_URL: 'http://localhost:8080',
      CORS_ALLOWED_ORIGINS: 'http://localhost:8080, https://serplists.com/,',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('typecheck:env SITE_ENV', { timeout: 60_000 }, () => {
  it.each(['production', 'staging'])('passes for %s', (siteEnv) => {
    expect(checkEnv({ SITE_ENV: siteEnv }).status).toBe(0);
  });

  it.each(['prod', 'Production', 'preview'])(
    'fails for %s, since a misspelled production would quietly hide the site from search engines',
    (siteEnv) => {
      expect(checkEnv({ SITE_ENV: siteEnv }).status).not.toBe(0);
    },
  );
});
