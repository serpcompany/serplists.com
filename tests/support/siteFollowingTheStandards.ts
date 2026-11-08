import type { SiteRequest } from '../../scripts/check-site-standards-lib';
import { loadBuiltRoutes, workerRedirect } from './builtRoutes';
import { whileServingLocally } from './localHttpServer';

export async function deployedWorkerWithTheBuiltRedirects(siteEnv: 'production' | 'staging', { brokenApi = false, templatesStatus = 200 } = {}) {
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
    if (pathname === '/api/templates') return { status: templatesStatus, location: null, headers: {}, body: '' };
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

type StandInSite = Awaited<ReturnType<typeof deployedWorkerWithTheBuiltRedirects>>;

export function servedOverHttp<T>(site: StandInSite, run: (origin: string) => Promise<T>): Promise<T> {
  return whileServingLocally((incoming, outgoing) => {
    const host = incoming.headers.host ?? '127.0.0.1';
    const headers = Object.fromEntries(
      Object.entries(incoming.headers).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value]] : [])),
    );
    site(`http://${host}${incoming.url ?? '/'}`, { headers })
      .then(({ status, location, headers: answerHeaders, body }) => {
        outgoing.writeHead(status, { ...answerHeaders, ...(location === null ? {} : { location }) }).end(body);
      })
      .catch((error: unknown) => outgoing.writeHead(500).end(String(error)));
  }, run);
}
