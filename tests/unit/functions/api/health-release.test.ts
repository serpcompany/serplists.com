import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import apiWorker from '../../../../functions/api/[[route]].ts';
import { API_ENV_SCHEMA } from '@functions/api/env-schema';
import { healthResponseSchema } from '@/lib/schemas/release';
import { apiEnv, TEST_AUTH_SECRET } from '../../../support/apiEnv';
import { silenceRequestLog } from '../../../support/apiRouter';
import { readJson } from '../../../support/readJson';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const health = async (siteEnv: string | undefined) => {
  const env = apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET, ...(siteEnv === undefined ? {} : { SITE_ENV: siteEnv }) });
  const response = await apiWorker.fetch(new Request('https://serplists.com/api/health'), env);
  expect(response.status).toBe(200);
  return { response, body: await readJson(response, healthResponseSchema) };
};

describe('GET /api/health, which names the release that answers', () => {
  beforeEach(() => silenceRequestLog());

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['staging', 'production'])('reports the commit the Worker was built from and the %s environment', async (siteEnv) => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', COMMIT);

    const { body } = await health(siteEnv);

    expect(body).toEqual({ status: 'ok', release: { commit: COMMIT, environment: siteEnv } });
  });

  it('reports an unknown commit and the local environment for a build that sets neither', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', undefined);

    const { body } = await health(undefined);

    expect(body.release).toEqual({ commit: 'unknown', environment: 'local' });
  });

  it('reports unknown rather than a release commit that is not a SHA, and local for an environment it does not know', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', 'main');

    const { body } = await health('prod');

    expect(body.release).toEqual({ commit: 'unknown', environment: 'local' });
  });

  it('is never cached, so a check right after a deploy reads the new release', async () => {
    const { response } = await health('production');

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('NEXT_PUBLIC_RELEASE_COMMIT in the env contract (pnpm run typecheck:env)', () => {
  it('takes a commit SHA, or nothing for a local build', () => {
    expect(API_ENV_SCHEMA.NEXT_PUBLIC_RELEASE_COMMIT.safeParse(COMMIT).success).toBe(true);
    expect(API_ENV_SCHEMA.NEXT_PUBLIC_RELEASE_COMMIT.safeParse(undefined).success).toBe(true);
  });

  it.each(['main', '$GITHUB_SHA', COMMIT.toUpperCase(), 'abc'])('refuses %j', (value) => {
    expect(API_ENV_SCHEMA.NEXT_PUBLIC_RELEASE_COMMIT.safeParse(value).success).toBe(false);
  });
});
