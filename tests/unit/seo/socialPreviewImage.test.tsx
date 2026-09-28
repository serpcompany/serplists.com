import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it } from 'vitest';

import { SEOHead } from '@/components/shared/SEOHead';

// Link previews showed no image: index.html and every SEOHead page named
// /placeholder.svg, a relative URL (invalid for og:image) to an SVG, which Facebook, X,
// LinkedIn and Slack do not render. Every page now names one absolute 1200x630 PNG.

const pngSize = (file: string) => {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii'), `${file} is a PNG`).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const expectShippedCardImage = (url: string | undefined) => {
  expect(url).toMatch(/^https:\/\/serplists\.com\/[\w/-]+\.png$/);
  const file = path.join('public', new URL(url!).pathname);
  expect(existsSync(file), file).toBe(true);
  expect(pngSize(file)).toEqual({ width: 1200, height: 630 });
};

const metaContent = (html: string, key: string) =>
  [...html.matchAll(/<meta\s[^>]*>/g)]
    .map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]])))
    .find((attributes) => attributes.name === key || attributes.property === key)?.content;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    return statSync(file).isDirectory() ? sourceFiles(file) : /\.(tsx?|html)$/.test(entry) ? [file] : [];
  });

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('link preview image', () => {
  it('is an absolute PNG in index.html, shipped in public/', () => {
    const html = readFileSync('index.html', 'utf8');

    expectShippedCardImage(metaContent(html, 'og:image'));
    expect(metaContent(html, 'twitter:image')).toBe(metaContent(html, 'og:image'));
    expect(metaContent(html, 'og:image:width')).toBe('1200');
    expect(metaContent(html, 'og:image:height')).toBe('630');
  });

  it('is the same absolute PNG on every SEOHead page', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://staging.serplists.pages.dev', pathname: '/templates' } },
    });
    const context: { helmet?: { meta: { toString(): string } } } = {};
    renderToStaticMarkup(
      <HelmetProvider context={context}>
        <SEOHead title="Discover Templates" />
      </HelmetProvider>,
    );
    const meta = context.helmet!.meta.toString();

    expectShippedCardImage(metaContent(meta, 'og:image'));
    expect(metaContent(meta, 'twitter:image')).toBe(metaContent(meta, 'og:image'));
  });

  it('never points at the SVG placeholder', () => {
    const offenders = ['index.html', ...sourceFiles('src'), ...sourceFiles('functions')].filter((file) =>
      readFileSync(file, 'utf8').includes('placeholder.svg'),
    );

    expect(offenders).toEqual([]);
  });
});
