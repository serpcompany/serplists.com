import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigEnv, UserConfig } from 'vite';

import { assertProductionApiUrl } from '../../../scripts/lib/buildEnv';

describe('production build environment', () => {
  it('does not load .dev.vars into the production build', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(scripts.build).toContain('vite build');
    expect(scripts.build).not.toContain('.dev.vars');
    expect(scripts.build).not.toContain('dotenv');
  });

  it('does not seed a local API URL into new .dev.vars files', () => {
    const activeLines = readFileSync('.dev.vars.example', 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#'));

    expect(activeLines.filter((line) => line.startsWith('VITE_API_URL='))).toEqual([]);
  });

  it.each([
    'http://localhost:8788/api',
    'http://LOCALHOST:8788/api',
    'http://127.0.0.1:9000/api',
    'http://127.1.2.3/api',
    'http://[::1]:8788/api',
    'http://0.0.0.0:8788/api',
    'http://app.localhost/api',
    'not a url',
  ])('refuses VITE_API_URL=%s in a production build', (value) => {
    expect(() => assertProductionApiUrl({ VITE_API_URL: value })).toThrow(/VITE_API_URL/);
  });

  it('accepts a missing or deployed value, or an explicit local opt-in', () => {
    expect(() => assertProductionApiUrl({})).not.toThrow();
    expect(() => assertProductionApiUrl({ VITE_API_URL: '' })).not.toThrow();
    expect(() => assertProductionApiUrl({ VITE_API_URL: 'https://serplists.com/api' })).not.toThrow();
    expect(() =>
      assertProductionApiUrl({ VITE_API_URL: 'http://localhost:8788/api', ALLOW_LOCAL_API_URL: '1' }),
    ).not.toThrow();
  });
});

describe('vite.config.ts build guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const loadConfig = async (configEnv: ConfigEnv): Promise<UserConfig> => {
    const { default: config } = await import('../../../vite.config');
    if (typeof config !== 'function') throw new Error('vite.config.ts must export a config function');
    return config(configEnv);
  };

  it('fails a production build that would bake in a local API URL', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8788/api');
    vi.stubEnv('ALLOW_LOCAL_API_URL', '');

    await expect(loadConfig({ command: 'build', mode: 'production' })).rejects.toThrow(/VITE_API_URL/);
  });

  it('leaves development builds and the dev server alone', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8788/api');

    await expect(loadConfig({ command: 'build', mode: 'development' })).resolves.toBeTruthy();
    await expect(loadConfig({ command: 'serve', mode: 'development' })).resolves.toBeTruthy();
  });
});
