import { expect, test, type APIRequestContext } from '@playwright/test';

// Link-preview crawlers do not run JavaScript, so they read only the HTML the server
// sends. Pages Functions (functions/seo/) fill in each public page's own title,
// description, og:type and canonical URL. The page functions run under wrangler pages dev
// (the API server here), not the Vite frontend, so these requests go to the API origin.

const API_ORIGIN = new URL(process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api').origin;
const SLACKBOT = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

async function fetchHead(request: APIRequestContext, path: string) {
  const response = await request.get(`${API_ORIGIN}${path}`, { headers: { 'User-Agent': SLACKBOT } });
  expect(response.status(), path).toBe(200);
  const html = await response.text();
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = (key: string) =>
    [...head.matchAll(/<meta\s[^>]*>/g)]
      .map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]])))
      .filter((attributes) => attributes.name === key || attributes.property === key)
      .map((attributes) => attributes.content);
  return {
    title: /<title>([^<]*)<\/title>/.exec(head)?.[1],
    meta,
    canonical: [...head.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((match) => match[1]),
  };
}

test('a shared public template unfurls with its own title and a PNG card', async ({ request }) => {
  const head = await fetchHead(request, '/profile/serp/ultimate-camping-checklist?utm_source=slack');

  expect(head.title).toBe('Ultimate Camping Checklist | SERP Lists');
  expect(head.meta('og:title')).toEqual(['Ultimate Camping Checklist | SERP Lists']);
  expect(head.meta('og:type')).toEqual(['article']);
  expect(head.meta('description')).toHaveLength(1);
  expect(head.meta('description')[0]).toContain('camping');
  expect(head.meta('og:url')).toEqual(['https://serplists.com/profile/serp/ultimate-camping-checklist']);
  expect(head.canonical).toEqual(['https://serplists.com/profile/serp/ultimate-camping-checklist']);
  expect(head.meta('og:image')).toEqual(['https://serplists.com/og-default.png']);

  const image = await request.get(`${API_ORIGIN}/og-default.png`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('category and library links unfurl with their own titles', async ({ request }) => {
  expect((await fetchHead(request, '/categories/outdoor')).title).toBe('outdoor Templates | SERP Lists');
  expect((await fetchHead(request, '/categories/business')).title).toBe('Business &amp; Operations Templates | SERP Lists');
  expect((await fetchHead(request, '/categories')).title).toBe('Browse Template Categories | SERP Lists');
  expect((await fetchHead(request, '/templates')).title).toBe('Discover Templates | SERP Lists');
});

test('an unknown template keeps the generic tags', async ({ request }) => {
  const head = await fetchHead(request, '/profile/serp/no-such-template-anywhere');

  expect(head.title).toBe('SERP Lists');
  expect(head.canonical).toEqual([]);
});

test('the category sitemap still answers next to the category pages', async ({ request }) => {
  const response = await request.get(`${API_ORIGIN}/categories/sitemap.xml`, { maxRedirects: 0 });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe('https://serplists.com/sitemaps/categories/1.xml');
});
