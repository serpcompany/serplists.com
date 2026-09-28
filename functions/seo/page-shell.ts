import { buildPageTitle } from '../../src/lib/brand';
import type { Env } from '../api/types';
import { log } from '../api/utils/logger';
import { canonicalUrl } from '../sitemap/shared';
import type { PublicPageMeta } from './public-page-meta';

// Serves index.html for a public page with that page's title, description, og:type and
// canonical URL already in <head>. Link-preview crawlers (Slack, X, Facebook, LinkedIn,
// Discord, iMessage) do not run JavaScript, so without this every shared link unfurled as
// the same generic card. The tags carry data-rh, so the app's SEOHead takes them over.

type PageContext = Pick<EventContext<Env, string, unknown>, 'request' | 'env'>;

const DESCRIPTION_MAX_LENGTH = 200;

interface SocialTags {
  title: string;
  description: string;
  url: string;
  type: PublicPageMeta['type'];
}

/** One line of at most 200 characters, cut at a word with an ellipsis. */
function summarizeDescription(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(line);
  if (characters.length <= DESCRIPTION_MAX_LENGTH) return line;
  const cut = characters.slice(0, DESCRIPTION_MAX_LENGTH - 1).join('');
  const endsAtWord = /\s/.test(characters[DESCRIPTION_MAX_LENGTH - 1]);
  return `${(endsAtWord ? cut.trimEnd() : cut.replace(/\s+\S*$/, '')) || cut}…`;
}

function buildSocialTags(meta: PublicPageMeta): SocialTags {
  return {
    title: buildPageTitle(meta.title),
    description: summarizeDescription(meta.description),
    // The production site, also on staging and preview hosts, as the sitemap does.
    url: canonicalUrl(meta.path),
    type: meta.type,
  };
}

const escapeAttribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Rewrites index.html's head. User text only ever goes in through setAttribute and text content. */
function applySocialTags(shell: Response, tags: SocialTags): Response {
  const setContent = (value: string): HTMLRewriterElementContentHandlers => ({
    element: (element) => {
      element.setAttribute('content', value);
    },
  });
  const remove: HTMLRewriterElementContentHandlers = {
    element: (element) => {
      element.remove();
    },
  };
  const url = escapeAttribute(tags.url);

  const rewritten = new HTMLRewriter()
    // index.html declares neither today; drop any that appear so the page keeps one of each.
    .on('link[rel="canonical"]', remove)
    .on('meta[property="og:url"]', remove)
    .on('title', {
      element: (element) => {
        element.setInnerContent(tags.title);
      },
    })
    .on('meta[name="description"]', setContent(tags.description))
    .on('meta[property="og:title"]', setContent(tags.title))
    .on('meta[property="og:description"]', setContent(tags.description))
    .on('meta[property="og:type"]', setContent(tags.type))
    .on('head', {
      element: (element) => {
        element.append(
          `<link rel="canonical" href="${url}" data-rh="true" />` +
            `<meta property="og:url" content="${url}" data-rh="true" />`,
          { html: true },
        );
      },
    })
    .transform(shell);

  const headers = new Headers(rewritten.headers);
  // The ETag names index.html, not this page's HTML.
  headers.delete('ETag');
  return new Response(rewritten.body, { status: rewritten.status, statusText: rewritten.statusText, headers });
}

const isHtml = (response: Response) => (response.headers.get('Content-Type') ?? '').includes('text/html');

/**
 * The single-page app's index.html for this request, with the page's tags when `resolve`
 * finds the page. Lookup failures and unknown pages get the plain shell, never an error.
 */
export async function servePublicPage(
  context: PageContext,
  route: string,
  resolve: () => PublicPageMeta | null | Promise<PublicPageMeta | null>,
): Promise<Response> {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

  // What the single-page-app fallback serves for this path, fetched without the visitor's
  // conditional headers so there is always a body to rewrite. The asset server applies
  // public/_headers to it, and the rewritten response keeps those headers.
  const shell = await env.ASSETS.fetch(new URL('/', request.url));
  if (request.method === 'HEAD') return new Response(null, shell);
  if (!shell.ok || !isHtml(shell)) return shell;

  let meta: PublicPageMeta | null = null;
  try {
    meta = await resolve();
  } catch (error) {
    log('error', 'public_page_meta_failed', { route, error: error instanceof Error ? error.message : String(error) });
  }
  return meta ? applySocialTags(shell, buildSocialTags(meta)) : shell;
}
