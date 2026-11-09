import { describe, expect, it } from 'vitest';

import { checkSiteStandards, checkSiteStandardsUntilItPasses, getWithoutFollowingRedirects } from '../../../scripts/check-site-standards-lib';
import { stringMatching } from '../../support/asymmetricMatchers';
import { whileServingLocally } from '../../support/localHttpServer';
import { deployedWorkerWithTheBuiltRedirects, servedOverHttp } from '../../support/siteFollowingTheStandards';

type Seen = { url: string | undefined; host: string | undefined; smokeTest: string | string[] | undefined };

function aSiteAnswering(status: number, headers: Record<string, string>, seen: Seen[]) {
  return <T>(run: (origin: string) => Promise<T>) =>
    whileServingLocally((incoming, outgoing) => {
      seen.push({ url: incoming.url, host: incoming.headers.host, smokeTest: incoming.headers['x-serplists-smoke-test'] });
      outgoing.writeHead(status, headers).end('the body');
    }, run);
}

describe('a request the site standards check sends', () => {
  it('reads a redirect without following it, resolving its location against the host it asked', async () => {
    const seen: Seen[] = [];

    const answer = await aSiteAnswering(308, { location: '/about/' }, seen)((origin) => getWithoutFollowingRedirects(`${origin}/about`));

    expect([answer.status, answer.location, answer.headers['location'], answer.body]).toEqual([308, stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/about\/$/), '/about/', 'the body']);
    expect(seen).toEqual([{ url: '/about', host: stringMatching(/^127\.0\.0\.1:\d+$/), smokeTest: undefined }]);
  });

  it('asks for another host when told to, with the headers it is given, and resolves the location against that host', async () => {
    const seen: Seen[] = [];

    const answer = await aSiteAnswering(308, { location: '/pricing/' }, seen)((origin) =>
      getWithoutFollowingRedirects(`${origin}/pricing`, { host: 'www.serplists.com', headers: { 'x-serplists-smoke-test': '1' } }),
    );

    expect(answer.location).toBe('http://www.serplists.com/pricing/');
    expect(seen).toEqual([{ url: '/pricing', host: 'www.serplists.com', smokeTest: '1' }]);
  });

  it('has no location for an answer that is not a redirect', async () => {
    const answer = await aSiteAnswering(200, {}, [])((origin) => getWithoutFollowingRedirects(`${origin}/`));

    expect([answer.status, answer.location]).toEqual([200, null]);
  });

  it('gives up on a site that does not answer in time, naming the URL', async () => {
    await whileServingLocally(
      () => {},
      async (origin) => {
        await expect(getWithoutFollowingRedirects(`${origin}/slow/`, { timeoutMs: 50 })).rejects.toThrow(`timed out: ${origin}/slow/`);
      },
    );
  });

  it('speaks TLS to an https URL, so a server that only speaks plain HTTP never sees a request', async () => {
    const seen: Seen[] = [];

    const refused = await aSiteAnswering(200, {}, seen)((origin) =>
      getWithoutFollowingRedirects(origin.replace('http:', 'https:')).then(
        () => false,
        () => true,
      ),
    );

    expect([refused, seen]).toEqual([true, []]);
  });
});

describe('the site standards check when it is given no way to request the site', () => {
  it('asks the site itself over HTTP', { timeout: 60_000 }, async () => {
    const site = await deployedWorkerWithTheBuiltRedirects('production');

    const result = await servedOverHttp(site, (origin) => checkSiteStandards({ baseUrl: origin, siteEnv: 'production', local: true }));

    expect(result.lines.filter((line) => line.startsWith('FAIL'))).toEqual([]);
    expect(result.lines).toContain('ok   /pricing on www.serplists.com -> 308 https://serplists.com/pricing/');
  });
});

describe('the site standards check when a request fails with something other than an Error', () => {
  it('says the site did not answer, for an unknown reason, before it checks again', async () => {
    const reasons: string[] = [];

    await expect(
      checkSiteStandardsUntilItPasses(
        { baseUrl: 'https://serp-checklists-production.serp.workers.dev', siteEnv: 'production', request: () => Promise.reject<never>('ECONNRESET') },
        { attempts: 2, sleep: async () => {}, onRetry: (_attempt, reason) => reasons.push(reason) },
      ),
    ).rejects.toBe('ECONNRESET');
    expect(reasons).toEqual(['the site did not answer (unknown error)']);
  });
});
