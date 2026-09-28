import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertSmokePersistPath,
  needsOpenPorts,
  resolveSmokeEnv,
  SMOKE_PERSIST_PATH,
} from '../../e2e/run-smoke-lib.mjs';

// run-smoke.mjs used to set PLAYWRIGHT_WRANGLER_PERSIST_TO only when it picked the
// ports itself. With any port or URL preset it still wiped and seeded
// .wrangler/smoke-state, but Playwright's API server ran on the default
// .wrangler/state: the developer's own local D1.

const repoRoot = path.resolve('/repo');
const openPorts = { frontendPort: 4180, apiPort: 8795 };

type Env = Record<string, string | undefined>;

function resolve(processEnv: Env) {
  return resolveSmokeEnv(processEnv, { openPorts: needsOpenPorts(processEnv) ? openPorts : null, repoRoot });
}

describe('resolveSmokeEnv', () => {
  it.each<[string, Env]>([
    ['nothing preset', {}],
    ['VITE_API_URL', { VITE_API_URL: 'http://localhost:8788/api' }],
    ['PLAYWRIGHT_API_PORT', { PLAYWRIGHT_API_PORT: '8790' }],
    ['PLAYWRIGHT_FRONTEND_PORT', { PLAYWRIGHT_FRONTEND_PORT: '5173' }],
    ['PLAYWRIGHT_BASE_URL', { PLAYWRIGHT_BASE_URL: 'http://localhost:5173' }],
    ['PLAYWRIGHT_API_URL', { PLAYWRIGHT_API_URL: 'http://127.0.0.1:8788/api' }],
    [
      'every port and URL',
      {
        PLAYWRIGHT_BASE_URL: 'http://localhost:5173',
        PLAYWRIGHT_FRONTEND_PORT: '5173',
        PLAYWRIGHT_API_PORT: '8790',
        PLAYWRIGHT_API_URL: 'http://localhost:8790/api',
        VITE_API_URL: 'http://localhost:8790/api',
      },
    ],
    ['PLAYWRIGHT_REUSE_EXISTING_SERVER=0', { PLAYWRIGHT_REUSE_EXISTING_SERVER: '0', PLAYWRIGHT_API_PORT: '8790' }],
  ])('runs the API server on the D1 it seeds with %s preset', (_, processEnv) => {
    const { env, seedPath } = resolve(processEnv);

    expect(seedPath).toBe(SMOKE_PERSIST_PATH);
    expect(env.PLAYWRIGHT_WRANGLER_PERSIST_TO).toBe(seedPath);
  });

  it('seeds and serves a preset persist path inside .wrangler', () => {
    const custom = path.join('.wrangler', 'my-smoke');
    const { env, seedPath } = resolve({ PLAYWRIGHT_API_PORT: '8790', PLAYWRIGHT_WRANGLER_PERSIST_TO: custom });

    expect(seedPath).toBe(custom);
    expect(env.PLAYWRIGHT_WRANGLER_PERSIST_TO).toBe(custom);
  });

  it('neither seeds nor changes the persist path when reusing running servers', () => {
    const { env, seedPath } = resolve({ PLAYWRIGHT_REUSE_EXISTING_SERVER: '1' });

    expect(seedPath).toBeNull();
    expect(env.PLAYWRIGHT_WRANGLER_PERSIST_TO).toBeUndefined();
  });

  it('does not seed a local D1 for a remote API', () => {
    const { seedPath, notes } = resolve({ PLAYWRIGHT_API_URL: 'https://staging.serplists.com/api' });

    expect(seedPath).toBeNull();
    expect(notes.join('\n')).toContain('not local');
  });

  it('refuses an API URL on another local port than the server it starts', () => {
    expect(() => resolve({ VITE_API_URL: 'http://localhost:9000/api' })).toThrow(/VITE_API_URL.*port 8788/);
    expect(() => resolve({ PLAYWRIGHT_API_PORT: '8790', PLAYWRIGHT_API_URL: 'http://localhost:8788/api' })).toThrow(
      /PLAYWRIGHT_API_URL.*port 8790/,
    );
  });
});

describe('assertSmokePersistPath', () => {
  it.each(['.wrangler/state', '.wrangler/state/v3', '.wrangler', '../x', '.wrangler-evil/x', '/elsewhere/smoke'])(
    'refuses to wipe %s',
    (candidate) => {
      expect(() => assertSmokePersistPath(candidate, repoRoot)).toThrow(/Refusing to reset smoke D1/);
    },
  );

  it('accepts folders inside .wrangler', () => {
    expect(assertSmokePersistPath(SMOKE_PERSIST_PATH, repoRoot)).toBe(path.join(repoRoot, '.wrangler', 'smoke-state'));
    expect(assertSmokePersistPath('.wrangler/custom-smoke', repoRoot)).toBe(path.join(repoRoot, '.wrangler', 'custom-smoke'));
  });
});

describe('playwright.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('starts the API server with --persist-to on the seeded path', async () => {
    vi.stubEnv('PLAYWRIGHT_WRANGLER_PERSIST_TO', path.join('.wrangler', 'smoke state'));
    const config = (await import('../../../playwright.config')).default;
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const api = servers.find((server) => server?.name === 'api');

    expect(api?.command).toContain(`--persist-to "${path.join('.wrangler', 'smoke state')}"`);
  }, 60_000);
});
