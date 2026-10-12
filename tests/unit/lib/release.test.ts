import '../../support/mockedNextNavigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { releaseCommit } from '@/lib/release';
import { RELEASE_META_NAME } from '@/lib/schemas/release';

import { elementsOfType, rootLayoutOn } from '../../support/rootLayout';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const releaseNamedOn = async (siteEnv: string | undefined) =>
  elementsOfType(await rootLayoutOn(siteEnv), 'meta')
    .filter((meta) => meta.props['name'] === RELEASE_META_NAME)
    .map((meta) => meta.props['content']);

describe('the release identifier in every page head', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['production', 'staging', undefined])(
    'names the commit the pages were built from once, as <meta name="serplists-release">, with SITE_ENV=%s',
    async (siteEnv) => {
      vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', COMMIT);

      expect(await releaseNamedOn(siteEnv)).toEqual([COMMIT]);
    },
  );

  it('names an unknown release when the build was given no commit', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', undefined);

    expect(await releaseNamedOn('production')).toEqual(['unknown']);
  });
});

describe('releaseCommit', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [COMMIT, COMMIT],
    ['0123abc', '0123abc'],
    [undefined, 'unknown'],
    ['', 'unknown'],
    ['main', 'unknown'],
    [` ${COMMIT}`, 'unknown'],
  ])('reads NEXT_PUBLIC_RELEASE_COMMIT=%j as %j', (value, commit) => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', value);

    expect(releaseCommit()).toBe(commit);
  });
});
