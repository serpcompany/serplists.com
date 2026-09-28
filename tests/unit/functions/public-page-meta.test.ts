import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onRequest as categoryIndexPage } from '../../../functions/categories/index';
import { onRequest as categoryPage } from '../../../functions/categories/[categorySlug]';
import { onRequest as templatePage } from '../../../functions/profile/[username]/[templateSlug]';
import { onRequest as templateLibraryPage } from '../../../functions/templates/index';
import type { Env } from '../../../functions/api/types';
import { BUNDLED_TEMPLATE_OWNER } from '../../../functions/seo/public-page-meta';
import { REPO_TEMPLATE_OWNER_SLUG } from '@/lib/repoTemplateCatalog';
import { FakeHTMLRewriter } from './fakeHtmlRewriter';

// Link-preview crawlers (Slack, X, Facebook, LinkedIn, Discord, iMessage) do not run
// JavaScript, so they only ever saw index.html's generic tags: every shared template,
// category and library link unfurled as the same "SERP Lists" card. Pages Functions now
// serve index.html for these routes with the page's own title, description, type and
// canonical URL filled in.

const SHELL = readFileSync('index.html', 'utf8');

type Row = [string, string | null, string, string | null, string | null, string | null, string | null];

let rows: Row[];
let queries: Array<{ sql: string; params: unknown[] }>;
let cacheStore: Map<string, Response>;
let failQuery: boolean;
let assetRequests: string[];

const env = {
  ASSETS: {
    fetch: async (input: Request | URL | string) => {
      const url = input instanceof Request ? input.url : String(input);
      assetRequests.push(url);
      return new Response(SHELL, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'self'",
          ETag: '"index-html"',
        },
      });
    },
  },
  DB: {
    prepare: (sql: string) => {
      const query = { sql, params: [] as unknown[] };
      queries.push(query);
      const statement = {
        bind: (...params: unknown[]) => {
          query.params = params;
          return statement;
        },
        raw: async () => {
          if (failQuery) throw new Error('D1 is unavailable');
          return rows;
        },
        all: async () => ({ results: [] }),
      };
      return statement;
    },
  },
} as unknown as Env;

type Handler = typeof templatePage;

async function serve(handler: Handler, url: string, params: Record<string, string>, method = 'GET') {
  const response = await handler({
    request: new Request(url, { method }),
    env,
    params,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next: async () => new Response(null, { status: 404 }),
    data: {},
    functionPath: '',
  } as unknown as Parameters<Handler>[0]);
  return { response, html: await response.text() };
}

const attr = (html: string, selector: RegExp): string | undefined => selector.exec(html)?.[1];
const metaContent = (html: string, key: string) =>
  attr(html, new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];
const canonicalOf = (html: string) => attr(html, /<link rel="canonical" href="([^"]*)"/);

beforeEach(() => {
  rows = [];
  queries = [];
  assetRequests = [];
  failQuery = false;
  cacheStore = new Map();
  vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
  vi.stubGlobal('caches', {
    default: {
      match: async (key: Request) => cacheStore.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => { cacheStore.set(key.url, response); },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public template pages', () => {
  it('gives a bundled template its own title, description, type and canonical URL without reading D1', async () => {
    const { response, html } = await serve(
      templatePage,
      'https://serplists.com/profile/serp/ultimate-camping-checklist?utm_source=slack',
      { username: 'serp', templateSlug: 'ultimate-camping-checklist' },
    );

    expect(response.status).toBe(200);
    expect(titleOf(html)).toMatch(/Camping.* \| SERP Lists$/);
    expect(metaContent(html, 'og:title')).toBe(titleOf(html));
    expect(metaContent(html, 'og:type')).toBe('article');
    expect(metaContent(html, 'description')).not.toBe('Create and run checklists for your processes.');
    expect(metaContent(html, 'og:description')).toBe(metaContent(html, 'description'));
    expect(canonicalOf(html)).toBe('https://serplists.com/profile/serp/ultimate-camping-checklist');
    expect(metaContent(html, 'og:url')).toBe('https://serplists.com/profile/serp/ultimate-camping-checklist');
    expect(metaContent(html, 'og:image')).toBe('https://serplists.com/og-default.png');
    expect(queries).toHaveLength(0);
    expect(BUNDLED_TEMPLATE_OWNER).toBe(REPO_TEMPLATE_OWNER_SLUG);
  });

  it('looks a database template up by its unique slug, public and not deleted, once per cache period', async () => {
    rows = [['tpl-1', 'weekly-review', 'Weekly Review', 'Close the week.', null, 'Review the week in 20 minutes.', 'Jane.Doe']];

    const first = await serve(templatePage, 'https://serplists.com/profile/jane.doe/weekly-review', {
      username: 'jane.doe',
      templateSlug: 'weekly-review',
    });
    const second = await serve(templatePage, 'https://serplists.com/profile/Jane.Doe/weekly-review', {
      username: 'Jane.Doe',
      templateSlug: 'weekly-review',
    });

    expect(titleOf(first.html)).toBe('Weekly Review | SERP Lists');
    expect(metaContent(first.html, 'description')).toBe('Review the week in 20 minutes.');
    // The canonical URL uses the stored username casing, like the sitemap.
    expect(canonicalOf(first.html)).toBe('https://serplists.com/profile/Jane.Doe/weekly-review');
    expect(titleOf(second.html)).toBe('Weekly Review | SERP Lists');

    expect(queries).toHaveLength(1);
    const [{ sql, params }] = queries;
    expect(sql).toMatch(/"templates"\."slug" = \?/);
    expect(sql).toMatch(/\+"templates"\."is_public" = 1/);
    expect(sql).toMatch(/"templates"\."deleted_at" is null/);
    expect(sql).toMatch(/limit \?/);
    expect(params).toEqual(['weekly-review', 1]);
  });

  it('looks a template id up by primary key, as the page does', async () => {
    const id = '2f1b0c8e-4a1d-4c55-9a1e-0d3c1f5b7a90';
    rows = [[id, null, 'No Slug Yet', null, null, null, 'jane']];

    const { html } = await serve(templatePage, `https://serplists.com/profile/jane/${id}`, { username: 'jane', templateSlug: id });

    expect(queries[0].sql).toMatch(/"templates"\."id" = \?/);
    expect(titleOf(html)).toBe('No Slug Yet | SERP Lists');
    expect(metaContent(html, 'description')).toBe('No Slug Yet - Interactive checklist template');
    expect(canonicalOf(html)).toBe(`https://serplists.com/profile/jane/${id}`);
  });

  it('serves the generic shell for a template that is private, missing or owned by someone else', async () => {
    rows = [];
    const missing = await serve(templatePage, 'https://serplists.com/profile/jane/private-plan', {
      username: 'jane',
      templateSlug: 'private-plan',
    });
    expect(missing.response.status).toBe(200);
    expect(missing.html).toBe(SHELL);

    rows = [['tpl-2', 'team-plan', 'Team Plan', 'Secret', null, null, 'someone-else']];
    const otherOwner = await serve(templatePage, 'https://serplists.com/profile/jane/team-plan', {
      username: 'jane',
      templateSlug: 'team-plan',
    });
    expect(otherOwner.html).toBe(SHELL);
  });

  it('escapes user text and keeps long descriptions to one short line', async () => {
    rows = [[
      'tpl-3',
      'hostile',
      '"><script>alert(1)</script>',
      `Line one\n\nLine two ${'word '.repeat(80)}`,
      null,
      null,
      'jane',
    ]];

    const { html } = await serve(templatePage, 'https://serplists.com/profile/jane/hostile', {
      username: 'jane',
      templateSlug: 'hostile',
    });

    // Text is set as text and attributes through setAttribute, so nothing breaks out of a tag.
    expect(html).not.toContain('"><script>');
    expect(titleOf(html)).toBe('"&gt;&lt;script&gt;alert(1)&lt;/script&gt; | SERP Lists');
    expect(metaContent(html, 'og:title')).toBe('&quot;><script>alert(1)</script> | SERP Lists');
    const description = metaContent(html, 'description') ?? '';
    expect(description.startsWith('Line one Line two word')).toBe(true);
    expect(description).not.toMatch(/\n/);
    expect(Array.from(description).length).toBeLessThanOrEqual(200);
    expect(description.endsWith('…')).toBe(true);
  });

  it('still serves the page when the lookup fails', async () => {
    failQuery = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, html } = await serve(templatePage, 'https://serplists.com/profile/jane/weekly-review', {
      username: 'jane',
      templateSlug: 'weekly-review',
    });

    expect(response.status).toBe(200);
    expect(html).toBe(SHELL);
  });

  it('keeps the shell headers, drops its ETag, and answers HEAD without reading D1', async () => {
    rows = [['tpl-1', 'weekly-review', 'Weekly Review', null, null, null, 'jane']];

    const { response } = await serve(templatePage, 'https://serplists.com/profile/jane/weekly-review', {
      username: 'jane',
      templateSlug: 'weekly-review',
    });
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('ETag')).toBeNull();
    // Always the single-page-app shell, whatever the visitor's path.
    expect(assetRequests).toEqual(['https://serplists.com/']);

    queries = [];
    cacheStore.clear();
    const head = await serve(
      templatePage,
      'https://serplists.com/profile/jane/weekly-review',
      { username: 'jane', templateSlug: 'weekly-review' },
      'HEAD',
    );
    expect(head.response.status).toBe(200);
    expect(head.html).toBe('');
    expect(queries).toHaveLength(0);
  });
});

describe('category and library pages', () => {
  it('names a built-in category and canonicalizes its slug', async () => {
    const { html } = await serve(categoryPage, 'https://serplists.com/categories/Business', { categorySlug: 'Business' });

    expect(titleOf(html)).toBe('Business &amp; Operations Templates | SERP Lists');
    expect(metaContent(html, 'description')).toBe('Templates for business processes, operations, and management');
    expect(metaContent(html, 'og:type')).toBe('website');
    expect(canonicalOf(html)).toBe('https://serplists.com/categories/business');
  });

  it('names a category that only a bundled template uses', async () => {
    const { html } = await serve(categoryPage, 'https://serplists.com/categories/tech', { categorySlug: 'tech' });

    expect(titleOf(html)).toBe('Tech Templates | SERP Lists');
    expect(metaContent(html, 'description')).toBe('Templates filed under Tech.');
    expect(canonicalOf(html)).toBe('https://serplists.com/categories/tech');
  });

  it('decodes a percent-encoded slug in any script', async () => {
    const { html } = await serve(categoryPage, 'https://serplists.com/categories/%E6%97%A5%E6%9C%AC%E8%AA%9E', {
      categorySlug: '%E6%97%A5%E6%9C%AC%E8%AA%9E',
    });

    // No bundled or built-in category has this name, so the shell stays generic.
    expect(html).toBe(SHELL);
  });

  it('leaves unknown categories and prototype keys generic', async () => {
    for (const slug of ['not-a-category', 'constructor', '__proto__']) {
      const { html } = await serve(categoryPage, `https://serplists.com/categories/${slug}`, { categorySlug: slug });
      expect(html, slug).toBe(SHELL);
    }
  });

  it('describes the category index and the template library', async () => {
    const categories = await serve(categoryIndexPage, 'https://serplists.com/categories', {});
    expect(titleOf(categories.html)).toBe('Browse Template Categories | SERP Lists');
    expect(metaContent(categories.html, 'description')).toBe('Explore checklist templates organized by category.');
    expect(canonicalOf(categories.html)).toBe('https://serplists.com/categories');

    const library = await serve(templateLibraryPage, 'https://serplists.com/templates?search=camping', {});
    expect(titleOf(library.html)).toBe('Discover Templates | SERP Lists');
    expect(canonicalOf(library.html)).toBe('https://serplists.com/templates');
  });

  it('names the production site as canonical on staging and preview hosts', async () => {
    const { html } = await serve(templateLibraryPage, 'https://staging.serplists.pages.dev/templates', {});

    expect(canonicalOf(html)).toBe('https://serplists.com/templates');
    expect(metaContent(html, 'og:url')).toBe('https://serplists.com/templates');
  });

  it('declares one canonical link and one og:url', async () => {
    const { html } = await serve(templateLibraryPage, 'https://serplists.com/templates', {});

    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:url"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
  });

  it('passes other methods straight to the static assets', async () => {
    const { response } = await serve(templateLibraryPage, 'https://serplists.com/templates', {}, 'POST');

    expect(response.status).toBe(200);
    expect(assetRequests).toEqual(['https://serplists.com/templates']);
  });
});
