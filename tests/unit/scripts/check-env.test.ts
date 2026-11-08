import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildScriptInvocation } from '../../../scripts/lib/run-tool';

const SCRIPT = fileURLToPath(new URL('../../../scripts/check-env.ts', import.meta.url));
const cwdWithoutDevVars = mkdtempSync(path.join(tmpdir(), 'check-env-'));

function checkEnv(overrides: Record<string, string | undefined>, cwd = cwdWithoutDevVars) {
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
  return spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000 });
}

function aCheckoutHolding(files: Record<string, string>): string {
  const cwd = mkdtempSync(path.join(cwdWithoutDevVars, 'checkout-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(cwd, name), text);
  return cwd;
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

describe('typecheck:env local env files', { timeout: 60_000 }, () => {
  it.each(['.env', '.env.local'])('refuses a %s that sets a value, since .dev.vars is the one local env file', (file) => {
    const result = checkEnv({}, aCheckoutHolding({ [file]: '# kept from an old setup\nSTRIPE_SECRET_KEY=sk_test_123\n' }));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${file} is deprecated. Use .dev.vars as the single local env file.`);
  });

  it('accepts a .env that holds only comments and blank lines', () => {
    const result = checkEnv({}, aCheckoutHolding({ '.env': '# moved to .dev.vars\n\n   # nothing else\n' }));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('env ok');
  });

  it('refuses a .dev.vars holding live keys or live Stripe secrets, and names each one once', () => {
    const devVars = 'STRIPE_SECRET_KEY_LIVE=sk_live_abc\nSTRIPE_SECRET_KEY=sk_live_def\nSTRIPE_PRICE_ID=price_123\n';

    const result = checkEnv({}, aCheckoutHolding({ '.dev.vars': devVars }));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('.dev.vars must contain local/test values only; remove: STRIPE_SECRET_KEY_LIVE, STRIPE_SECRET_KEY');
  });

  it('reads the auth secret from .dev.vars when the shell sets none', () => {
    const result = checkEnv(
      { BETTER_AUTH_SECRET: undefined },
      aCheckoutHolding({ '.dev.vars': 'BETTER_AUTH_SECRET="a-better-auth-secret-of-32-chars-or-more"\n' }),
    );

    expect(result.status).toBe(0);
  });
});

describe('typecheck:env auth secret', { timeout: 60_000 }, () => {
  it.each<Record<string, string | undefined>>([
    { BETTER_AUTH_SECRET: undefined },
    { BETTER_AUTH_SECRET: 'too-short' },
    { BETTER_AUTH_SECRET: '                                        ' },
    { BETTER_AUTH_SECRET: undefined, JWT_SECRET: 'short-legacy-secret' },
  ])('refuses %j, since sessions signed with a short secret can be forged', (overrides) => {
    const result = checkEnv(overrides);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('A 32+ char BETTER_AUTH_SECRET (or legacy JWT_SECRET) is required');
  });

  it('accepts a legacy JWT_SECRET of 32 or more characters in place of BETTER_AUTH_SECRET', () => {
    const result = checkEnv({ BETTER_AUTH_SECRET: undefined, JWT_SECRET: 'a-legacy-jwt-secret-of-32-chars-or-more' });

    expect(result.status).toBe(0);
  });
});
