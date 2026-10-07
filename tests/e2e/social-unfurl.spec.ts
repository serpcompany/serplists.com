import { expect, test, type APIRequestContext } from '@playwright/test';

import { capturedGroup } from '../support/elements';
import { APP_URL } from './support/stack';

const SLACKBOT = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

async function fetchHeadWithoutRedirect(request: APIRequestContext, path: string, userAgent = SLACKBOT) {
  const response = await request.get(`${APP_URL}${path}`, { headers: { 'User-Agent': userAgent }, maxRedirects: 0 });
  expect(response.status(), path).toBe(200);
  const html = await response.text();
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = (key: string) =>
    [...head.matchAll(/<meta\s[^>]*>/g)]
      .map(([tag]) =>
        Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((pair): [string, string] => [capturedGroup(pair, 1), capturedGroup(pair, 2)])),
      )
      .filter((attributes) => attributes['name'] === key || attributes['property'] === key)
      .map((attributes) => attributes['content']);
  return {
    title: /<title>([^<]*)<\/title>/.exec(head)?.[1],
    meta,
    canonical: [...head.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((match) => match[1]),
  };
}

test('a shared public template unfurls with its own title and a PNG card', async ({ request }) => {
  const head = await fetchHeadWithoutRedirect(request, '/profile/serp/ultimate-camping-checklist/?utm_source=slack');

  expect(head.title).toBe('Ultimate Camping Checklist | SERP Lists');
  expect(head.meta('og:title')).toEqual(['Ultimate Camping Checklist | SERP Lists']);
  expect(head.meta('og:type')).toEqual(['article']);
  expect(head.meta('description')).toHaveLength(1);
  expect(head.meta('description')[0]).toContain('camping');
  expect(head.meta('og:url')).toEqual(['https://serplists.com/profile/serp/ultimate-camping-checklist/']);
  expect(head.canonical).toEqual(['https://serplists.com/profile/serp/ultimate-camping-checklist/']);
  expect(head.meta('og:image')).toEqual(['https://serplists.com/og-default.png']);

  const image = await request.get(`${APP_URL}/og-default.png`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('category and library links unfurl with their own titles', async ({ request }) => {
  expect((await fetchHeadWithoutRedirect(request, '/categories/outdoor/')).title).toBe('outdoor Templates | SERP Lists');
  expect((await fetchHeadWithoutRedirect(request, '/categories/business/')).title).toBe('Business &amp; Operations Templates | SERP Lists');
  expect((await fetchHeadWithoutRedirect(request, '/categories/')).title).toBe('Browse Template Categories | SERP Lists');
  expect((await fetchHeadWithoutRedirect(request, '/templates/')).title).toBe('Template Library | SERP Lists');
});

test('an unknown template unfurls as not found, out of search and without a canonical URL', async ({ request }) => {
  const head = await fetchHeadWithoutRedirect(request, '/profile/serp/no-such-template-anywhere/');

  expect(head.title).toBe('Template not found | SERP Lists');
  expect(head.meta('robots')).toEqual(['noindex, nofollow']);
  expect(head.canonical).toEqual([]);
});

test('people get the same tags as link-preview crawlers', async ({ request }) => {
  for (const path of ['/profile/serp/ultimate-camping-checklist/', '/categories/outdoor/', '/categories/', '/templates/']) {
    const forPeople = await fetchHeadWithoutRedirect(request, path, BROWSER);
    const forCrawlers = await fetchHeadWithoutRedirect(request, path);
    expect(forPeople.title, path).toBe(forCrawlers.title);
    expect(forPeople.title, path).not.toBe('SERP Lists');
    expect(forPeople.canonical, path).toEqual(forCrawlers.canonical);
  }
});

test('the category sitemap still answers next to the category pages, page included', async ({ request }) => {
  const response = await request.get(`${APP_URL}/categories/sitemap.xml`, { maxRedirects: 0 });

  expect(response.status()).toBe(308);
  expect(response.headers()['location']).toBe('https://serplists.com/sitemaps/categories/1.xml');

  const second = await request.get(`${APP_URL}/categories/sitemap.xml?page=2`, { maxRedirects: 0 });
  expect(second.status()).toBe(308);
  expect(second.headers()['location']).toBe('https://serplists.com/sitemaps/categories/2.xml');
});
