import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Cloudflare Pages runs a Function for every request to a path that has one, and bills
// each as a Workers request; a path without one is a static file, served for free. A
// Function on a public page path (/profile/*, /templates, /categories, or middleware
// above them) would run on every page load by a person. Link-preview tags are served
// under /link-preview/ instead, which a Cloudflare URL rewrite sends only link-preview
// bots to (docs/FRONTEND.md, Link previews).

const FUNCTIONS_DIR = 'functions';

// The paths that may run a Function: the API, the sitemaps, and the link previews.
const FUNCTION_PATH_PREFIXES = ['/api/', '/sitemap.xml', '/sitemaps/', '/categories/sitemap.xml', '/link-preview/'];

const HANDLER_EXPORT = /export\s+(?:const|async\s+function|function)\s+onRequest\w*\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|js)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [entryPath] : [];
  });
}

/** The URL path a Pages Function file answers, as Pages maps the functions directory. */
function routePath(file: string): string {
  const segments = path.relative(FUNCTIONS_DIR, file).replace(/\.(?:ts|js)$/, '').split(path.sep);
  const last = segments.at(-1);
  // index answers its directory; _middleware runs for everything under its directory.
  if (last === 'index') segments.pop();
  if (last === '_middleware') segments[segments.length - 1] = '*';
  return `/${segments.join('/')}`;
}

const functionRoutes = () =>
  sourceFiles(FUNCTIONS_DIR)
    .filter((file) => HANDLER_EXPORT.test(readFileSync(file, 'utf8')))
    .map((file) => ({ file: file.split(path.sep).join('/'), route: routePath(file) }));

describe('Pages Function routes', () => {
  it('finds the routes the functions directory defines', () => {
    const routes = functionRoutes().map(({ route }) => route);

    expect(routes).toContain('/api/[[route]]');
    expect(routes).toContain('/link-preview/profile/[username]/[templateSlug]');
    expect(routes).toContain('/categories/sitemap.xml');
  });

  it('puts no Function on a public page path, so page loads by people stay static', () => {
    const outside = functionRoutes().filter(
      ({ route }) => !FUNCTION_PATH_PREFIXES.some((prefix) => route === prefix || route.startsWith(prefix)),
    );

    expect(outside, 'Functions on public page paths run (and bill) on every page load').toEqual([]);
  });

  it('maps files to routes the way Pages does', () => {
    expect(routePath(path.join(FUNCTIONS_DIR, 'profile', '[username]', '[templateSlug].ts'))).toBe(
      '/profile/[username]/[templateSlug]',
    );
    expect(routePath(path.join(FUNCTIONS_DIR, 'templates', 'index.ts'))).toBe('/templates');
    expect(routePath(path.join(FUNCTIONS_DIR, '_middleware.ts'))).toBe('/*');
  });
});
