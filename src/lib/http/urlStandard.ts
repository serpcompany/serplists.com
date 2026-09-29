// The SERP URL standard (serpcompany/serp docs/engineering/standards/url-trailing-slash.md):
// the homepage is `/`, a page ends in a slash (`/about/`), a file never does (`/robots.txt`),
// and the other form of either redirects (308) to it in one hop. Two kinds of path are not
// pages and keep exactly the path they are called with: the API (`/api/...`, which Better
// Auth, Stripe's webhook and agents call directly) and `/.well-known/`. A profile page is a
// page even when its username looks like a file name (`/profile/john.doe/`).
//
// canonicalPath() is the form of every URL the app writes: links, canonical and Open Graph
// URLs, sitemaps, emails and callbacks. next.config.ts builds its redirects from this module,
// so every other form reaches it. Pure and framework-free: the API, the sitemaps and
// next.config.ts import it (SHARED_FROM_SRC in .dependency-cruiser.cjs).

/** A last path segment with an extension, which makes the path a file. */
const FILE_SEGMENT = /[^/]+\.\w+$/;
/** Paths the standard leaves alone. */
const UNTOUCHED_PATH = /^\/(?:api|\.well-known)(?:\/|$)/i;
/** /profile/<username> and /profile/<username>/<template>, pages whatever their names. */
const PROFILE_PAGE_PATH = /^\/profile\/[^/]+(?:\/[^/]+)?$/i;

/**
 * The canonical form of a pathname (no query or hash): `/` stays `/`, a page gets its
 * trailing slash, a file loses it, and API and /.well-known paths are returned as they are.
 */
export function canonicalPath(pathname: string): string {
  if (!pathname.startsWith('/') || UNTOUCHED_PATH.test(pathname)) return pathname;
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return '/';
  if (PROFILE_PAGE_PATH.test(trimmed)) return `${trimmed}/`;
  const lastSegment = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return FILE_SEGMENT.test(lastSegment) ? trimmed : `${trimmed}/`;
}

// Redirect rules in next.config.ts's shape (Next.js's Redirect type, without importing Next.js
// into a module the API shares). Next.js matches a source with an optional trailing slash and
// never on /_next; OpenNext fills a destination with path-to-regexp and checks each value
// against its parameter's pattern, so a parameter that spans segments must be a repeated one
// (`:dir+`), and a rule whose parameters all match nothing is not filled at all.

export type RedirectCondition =
  | { type: 'host'; value: string }
  | { type: 'header' | 'cookie' | 'query'; key: string; value?: string };

export interface RedirectRule {
  source: string;
  destination: string;
  permanent: boolean;
  has?: RedirectCondition[];
  missing?: RedirectCondition[];
}

const FILE = '[^/]+\\.\\w+';
// A first segment that does not start a path the standard leaves alone.
const TOP = '(?!(?:api|\\.well-known)/)[^/]+';
// The same, for a file: /profile/<username>/ is a page, whatever the username looks like.
const FILE_TOP = '(?!(?:api|profile|\\.well-known)/)[^/]+';
// The last segment of a page path: no extension, and not followed by the slash it gets, which
// the optional trailing slash Next.js adds to every source would otherwise match again.
const PAGE = '(?![^/]*\\.\\w+$)[^/]+(?!/)';

/**
 * The redirects that give every path on this host its canonical form: /robots.txt/ to
 * /robots.txt, /about to /about/. Used with `trailingSlash: true` and
 * `skipTrailingSlashRedirect: true`: Next.js's own trailing-slash redirects would also move the
 * API (/api/auth/sign-in to /api/auth/sign-in/), and OpenNext skips the file one. Each form
 * takes one rule per number of segments, because OpenNext cannot fill an empty path parameter.
 */
export function trailingSlashRedirects(): RedirectRule[] {
  const rule = (source: string, destination: string): RedirectRule => ({ source, destination, permanent: true });
  return [
    // Files never end in a slash.
    rule(`/:file(${FILE})/`, '/:file'),
    rule(`/:top(${FILE_TOP})/:file(${FILE})/`, '/:top/:file'),
    rule(`/:top(${FILE_TOP})/:dir+/:file(${FILE})/`, '/:top/:dir+/:file'),
    // Profile pages end in one, whatever the username looks like (john.doe).
    rule('/profile/:username([^/]+(?!/))', '/profile/:username/'),
    rule('/profile/:username/:template([^/]+(?!/))', '/profile/:username/:template/'),
    // So does every other page.
    rule(`/:page((?!(?:api|\\.well-known)$)${PAGE})`, '/:page/'),
    rule(`/:top(${TOP})/:page(${PAGE})`, '/:top/:page/'),
    rule(`/:top(${TOP})/:dir+/:page(${PAGE})`, '/:top/:dir+/:page/'),
  ];
}
