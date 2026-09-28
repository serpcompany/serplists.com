import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../scripts/check-env.mjs', import.meta.url));
// Run from an empty directory so a developer's .dev.vars cannot change the result.
const cwd = mkdtempSync(path.join(tmpdir(), 'check-env-'));

function checkEnv(overrides: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  Object.assign(env, { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!', ...overrides });
  return spawnSync(process.execPath, [SCRIPT], { cwd, env, encoding: 'utf8', timeout: 60_000 });
}

// The pre-deploy check (pnpm run typecheck:env) must reject the same origin
// values the API rejects at runtime (functions/api/env.ts).
describe('scripts/check-env.mjs origin variables', { timeout: 60_000 }, () => {
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it.each([
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
