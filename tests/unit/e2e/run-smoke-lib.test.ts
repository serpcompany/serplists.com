import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderStaticHeaders } from '@/lib/http/securityHeaders';

import {
  assertSmokePersistPath,
  buildPreviewArgs,
  describeBuiltSiteEnv,
  E2E_AUTH_SECRET,
  E2E_SITE_ENV,
  needsOpenPort,
  resolveSmokeEnv,
  SMOKE_PERSIST_PATH,
} from '../../e2e/run-smoke-lib';

const repoRoot = path.resolve('/repo');
const openPort = 4180;

type Env = Record<string, string | undefined>;

function resolve(processEnv: Env) {
  return resolveSmokeEnv(processEnv, { openPort: needsOpenPort(processEnv) ? openPort : null, repoRoot });
}

describe('resolveSmokeEnv', () => {
  it.each<[string, Env]>([
    ['nothing preset', {}],
    ['PLAYWRIGHT_PORT', { PLAYWRIGHT_PORT: '5173' }],
    ['PLAYWRIGHT_BASE_URL', { PLAYWRIGHT_BASE_URL: 'http://localhost:5173' }],
    ['PLAYWRIGHT_API_URL', { PLAYWRIGHT_API_URL: 'http://localhost:4173/api' }],
    ['every port and URL', { PLAYWRIGHT_BASE_URL: 'http://localhost:5173', PLAYWRIGHT_PORT: '5173', PLAYWRIGHT_API_URL: 'http://localhost:5173/api' }],
    ['PLAYWRIGHT_REUSE_EXISTING_SERVER=0', { PLAYWRIGHT_REUSE_EXISTING_SERVER: '0', PLAYWRIGHT_PORT: '5173' }],
  ])("runs the preview on the D1 it seeds, never the developer's own, with %s preset", (_, processEnv) => {
    const { env, seedPath } = resolve(processEnv);

    expect(seedPath).toBe(SMOKE_PERSIST_PATH);
    expect(env['PLAYWRIGHT_WRANGLER_PERSIST_TO']).toBe(seedPath);
    expect(buildPreviewArgs(env)).toEqual(expect.arrayContaining(['--persist-to', seedPath]));
  });

  it('uses the free port it picked for the pages and the API alike', () => {
    const { env } = resolve({});

    expect(env['PLAYWRIGHT_BASE_URL']).toBe('http://localhost:4180');
    expect(env['PLAYWRIGHT_API_URL']).toBe('http://localhost:4180/api');
  });

  it('keeps a preset port and puts the API on the same origin', () => {
    const { env } = resolve({ PLAYWRIGHT_PORT: '5173' });

    expect(env['PLAYWRIGHT_BASE_URL']).toBe('http://localhost:5173');
    expect(env['PLAYWRIGHT_API_URL']).toBe('http://localhost:5173/api');
  });

  it('seeds and serves a preset persist path inside .wrangler', () => {
    const custom = '.wrangler/my-smoke';
    const { env, seedPath } = resolve({ PLAYWRIGHT_PORT: '5173', PLAYWRIGHT_WRANGLER_PERSIST_TO: custom });

    expect(seedPath).toBe(custom);
    expect(env['PLAYWRIGHT_WRANGLER_PERSIST_TO']).toBe(custom);
  });

  it('neither seeds nor changes the persist path when reusing a running server', () => {
    const { env, seedPath } = resolve({ PLAYWRIGHT_REUSE_EXISTING_SERVER: '1' });

    expect(seedPath).toBeNull();
    expect(env['PLAYWRIGHT_WRANGLER_PERSIST_TO']).toBeUndefined();
  });

  it('does not seed a local D1 for a remote app', () => {
    const { seedPath, notes } = resolve({ PLAYWRIGHT_BASE_URL: 'https://staging.serplists.com' });

    expect(seedPath).toBeNull();
    expect(notes.join('\n')).toContain('not local');
  });

  it('refuses an API URL off the app origin', () => {
    expect(() => resolve({ PLAYWRIGHT_API_URL: 'http://localhost:8788/api' })).toThrow(
      /PLAYWRIGHT_API_URL=http:\/\/localhost:8788\/api is not on the app's origin \(http:\/\/localhost:4173\)/,
    );
    expect(() => resolve({ PLAYWRIGHT_PORT: '5173', PLAYWRIGHT_API_URL: 'http://localhost:4173/api' })).toThrow(
      /not on the app's origin/,
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

  it('refuses a path a shell would split or change, since the preview hands it to wrangler unquoted', () => {
    expect(() => assertSmokePersistPath('.wrangler/smoke state', repoRoot)).toThrow(/through a shell/);
    expect(() => assertSmokePersistPath('.wrangler/smoke&state', repoRoot)).toThrow(/through a shell/);
  });
});

describe('buildPreviewArgs', () => {
  it('serves the build on the app port with the Worker vars that name its origin', () => {
    expect(
      buildPreviewArgs({
        PLAYWRIGHT_BASE_URL: 'http://localhost:4180',
        PLAYWRIGHT_WRANGLER_PERSIST_TO: '.wrangler/smoke-state',
        CORS_ALLOWED_ORIGINS: 'https://tools.example.com',
      }),
    ).toEqual([
      'preview',
      '--port',
      '4180',
      '--show-interactive-dev-session=false',
      '--persist-to',
      '.wrangler/smoke-state',
      '--var',
      'FRONTEND_URL:http://localhost:4180',
      '--var',
      'CORS_ALLOWED_ORIGINS:https://tools.example.com,http://localhost:4180',
      '--var',
      `BETTER_AUTH_SECRET:${E2E_AUTH_SECRET}`,
      '--var',
      `SITE_ENV:${E2E_SITE_ENV}`,
    ]);
  });

  it('runs the preview with the production SITE_ENV the build was made with', () => {
    expect(E2E_SITE_ENV).toBe('production');
    expect(buildPreviewArgs({})).toEqual(expect.arrayContaining(['--var', 'SITE_ENV:production']));
  });

  it("uses the shell's auth secret when it sets one", () => {
    expect(buildPreviewArgs({ BETTER_AUTH_SECRET: 'ci-build-placeholder-secret-32-chars-minimum' })).toContain(
      'BETTER_AUTH_SECRET:ci-build-placeholder-secret-32-chars-minimum',
    );
  });

  it('refuses a value the shell would change, without printing a secret', () => {
    const secret = 'se cret&"%PATH%^!';

    expect(() => buildPreviewArgs({ BETTER_AUTH_SECRET: secret })).toThrow(/BETTER_AUTH_SECRET reaches wrangler through a shell/);
    try {
      buildPreviewArgs({ BETTER_AUTH_SECRET: secret });
    } catch (error) {
      expect(String(error)).not.toContain('cret');
    }
  });
});

describe('describeBuiltSiteEnv', () => {
  it('reads the configuration a build was made for from the static headers it ships', () => {
    expect(describeBuiltSiteEnv('/*\n  X-Frame-Options: DENY\n')).toBe('production');
    expect(describeBuiltSiteEnv('/*\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n')).toBe(
      'non-production',
    );
    expect(describeBuiltSiteEnv(null)).toBeNull();
  });

  it('recognizes what scripts/generate-static-headers.ts writes for each build', () => {
    expect(describeBuiltSiteEnv(renderStaticHeaders({ production: true }))).toBe('production');
    expect(describeBuiltSiteEnv(renderStaticHeaders({ production: false }))).toBe('non-production');
  });
});

describe('playwright.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves the app from the preview script on the port run-smoke chose', async () => {
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://localhost:4180');
    const config = (await import('../../../playwright.config')).default;
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];

    expect(servers).toHaveLength(1);
    expect(servers[0]?.command).toBe('node --import tsx tests/e2e/preview-server.ts');
    expect(servers[0]?.url).toBe('http://localhost:4180/api/health');
    expect(config.use?.baseURL).toBe('http://localhost:4180');
  }, 60_000);
});
