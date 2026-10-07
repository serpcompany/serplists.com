import { loadBuiltRoutes, workerRedirect } from '../../support/builtRoutes';
import { describe, expect, it } from 'vitest';

import { checkSiteStandards, SMOKE_TEST_HEADER, type SiteRequest } from '../../../scripts/check-site-standards';
import { SMOKE_TEST_HEADER as APP_SMOKE_TEST_HEADER } from '@/lib/seo/siteOrigin';


async function deployedWorkerWithTheBuiltRedirects(siteEnv: 'production' | 'staging', { brokenApi = false } = {}) {
  const { redirects } = await loadBuiltRoutes(siteEnv);
  const production = siteEnv === 'production';
  return async (url: string, { host, headers }: Parameters<SiteRequest>[1]) => {
    const target = new URL(url);
    const requestUrl = host ? `${target.protocol}//${host}${target.pathname}${target.search}` : url;
    const redirect = await workerRedirect(redirects, requestUrl, { headers });
    if (redirect) return { status: redirect.status, location: new URL(redirect.location, requestUrl).href, headers: {}, body: '' };
    const { pathname } = target;
    if (brokenApi && pathname === '/api/health/') {
      return { status: 308, location: `${target.origin}/api/health`, headers: {}, body: '' };
    }
    const noindex = production ? {} : { 'x-robots-tag': 'noindex, nofollow' };
    if (pathname === '/robots.txt') {
      const body = production
        ? 'User-Agent: *\nAllow: /\n\nSitemap: https://serplists.com/sitemap.xml\n'
        : 'User-Agent: *\nDisallow: /\n';
      return { status: 200, location: null, headers: noindex, body };
    }
    if (pathname === '/sitemap.xml') {
      return { status: 200, location: null, headers: noindex, body: '<sitemapindex><sitemap><loc>https://serplists.com/sitemaps/pages/1.xml</loc></sitemap></sitemapindex>' };
    }
    if (pathname === '/sitemaps/pages/1.xml') {
      return { status: 200, location: null, headers: noindex, body: '<urlset><url><loc>https://serplists.com/</loc></url><url><loc>https://serplists.com/about/</loc></url></urlset>' };
    }
    const body = production ? '<script>https://www.googletagmanager.com/gtm.js?id=GTM-PZZFQBGG</script>' : '<html></html>';
    return { status: pathname.startsWith('/api/') && pathname.endsWith('/') ? 404 : 200, location: null, headers: noindex, body };
  };
}

describe('check-site-standards', () => {
  it('uses the header next.config.ts exempts', () => {
    expect(SMOKE_TEST_HEADER).toBe(APP_SMOKE_TEST_HEADER);
  });

  it.each(['production', 'staging'] as const)('passes a %s site that follows the standards', async (siteEnv) => {
    for (const [baseUrl, local] of [
      ['http://localhost:8787', true],
      ['https://serp-checklists-production.serp.workers.dev', false],
    ] as const) {
      const result = await checkSiteStandards({ baseUrl, siteEnv, local, request: await deployedWorkerWithTheBuiltRedirects(siteEnv) });
      expect(result.lines.filter((line) => line.startsWith('FAIL'))).toEqual([]);
      expect(result.passed).toBeGreaterThan(30);
    }
  });

  it('fails a site that redirects the API or sends the wrong environment rules', async () => {
    const brokenApi = await checkSiteStandards({
      baseUrl: 'http://localhost:8787',
      siteEnv: 'production',
      local: true,
      request: await deployedWorkerWithTheBuiltRedirects('production', { brokenApi: true }),
    });
    expect(brokenApi.lines.filter((line) => line.startsWith('FAIL'))).toEqual(['FAIL 308 /api/health/ (the API is never redirected)']);

    const stagingAsProduction = await checkSiteStandards({
      baseUrl: 'http://localhost:8787',
      siteEnv: 'production',
      local: true,
      request: await deployedWorkerWithTheBuiltRedirects('staging'),
    });
    expect(stagingAsProduction.failed).toBeGreaterThan(0);
    expect(stagingAsProduction.lines).toContain('FAIL robots.txt allows crawling');
  });
});
