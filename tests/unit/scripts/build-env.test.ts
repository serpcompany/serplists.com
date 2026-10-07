import { readFileSync } from 'node:fs';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertProductionApiUrl } from '../../../scripts/lib/buildEnv';
import { z } from 'zod';
import { parseJsonText } from '../../support/storedJson';

describe('production build environment', () => {
  it('does not load .dev.vars into the production build', () => {
    const { scripts } = parseJsonText(readFileSync('package.json', 'utf8'), z.object({ scripts: z.record(z.string()) }).passthrough());

    expect(scripts['build']).toContain('next build');
    expect(scripts['build']).not.toContain('.dev.vars');
    expect(scripts['build']).not.toContain('dotenv');
  });

  it('does not seed an API URL into new .dev.vars files', () => {
    const activeLines = readFileSync('.dev.vars.example', 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#'));

    expect(activeLines.filter((line) => /^(NEXT_PUBLIC|VITE)_API_URL=/.test(line))).toEqual([]);
  });

  it.each([
    'http://localhost:3000/api',
    'http://LOCALHOST:3000/api',
    'http://127.0.0.1:9000/api',
    'http://127.1.2.3/api',
    'http://[::1]:3000/api',
    'http://0.0.0.0:3000/api',
    'http://app.localhost/api',
    'not a url',
  ])("refuses NEXT_PUBLIC_API_URL=%s in a production build, which inlines it into every visitor's bundle", (value) => {
    expect(() => assertProductionApiUrl({ NEXT_PUBLIC_API_URL: value })).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('accepts a missing or deployed value, or an explicit local opt-in', () => {
    expect(() => assertProductionApiUrl({})).not.toThrow();
    expect(() => assertProductionApiUrl({ NEXT_PUBLIC_API_URL: '' })).not.toThrow();
    expect(() => assertProductionApiUrl({ NEXT_PUBLIC_API_URL: 'https://serplists.com/api' })).not.toThrow();
    expect(() =>
      assertProductionApiUrl({ NEXT_PUBLIC_API_URL: 'http://localhost:3000/api', ALLOW_LOCAL_API_URL: '1' }),
    ).not.toThrow();
  });
});

describe('next.config.ts build guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const loadConfig = async (phase: string) => {
    const { default: config } = await import('../../../next.config');
    return config(phase);
  };

  it('fails a production build that would bake in a local API URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000/api');
    vi.stubEnv('ALLOW_LOCAL_API_URL', '');

    await expect(loadConfig(PHASE_PRODUCTION_BUILD)).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('leaves the dev server and a built server alone', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000/api');

    await expect(loadConfig(PHASE_DEVELOPMENT_SERVER)).resolves.toBeTruthy();
    await expect(loadConfig(PHASE_PRODUCTION_SERVER)).resolves.toBeTruthy();
  });
});
