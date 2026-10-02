import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { metadata as rootMetadata } from '@/app/layout';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

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

type ImageEntry = { url: string | URL; width?: number | string; height?: number | string };

const firstImage = (images: unknown): ImageEntry => {
  const [image] = Array.isArray(images) ? images : [images];
  return typeof image === 'string' || image instanceof URL ? { url: image } : (image as ImageEntry);
};

const resolveAgainstMetadataBase = (url: string | URL) => new URL(url, rootMetadata.metadataBase ?? undefined).toString();

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    return statSync(file).isDirectory() ? sourceFiles(file) : /\.(tsx?|html)$/.test(entry) ? [file] : [];
  });

describe('link preview image, one absolute 1200x630 PNG since social sites render neither SVG images nor relative URLs', () => {
  it('is an absolute PNG in the root layout defaults, shipped in public/', () => {
    const image = firstImage(rootMetadata.openGraph?.images);
    const ogImage = resolveAgainstMetadataBase(image.url);

    expectShippedCardImage(ogImage);
    expect(resolveAgainstMetadataBase(firstImage(rootMetadata.twitter?.images).url)).toBe(ogImage);
    expect(Number(image.width)).toBe(1200);
    expect(Number(image.height)).toBe(630);
  });

  it('is the same absolute PNG on every page with its own metadata', () => {
    const metadata = buildPageMetadata({ title: 'Template Library', path: '/templates' });
    const ogImage = String(firstImage(metadata.openGraph?.images).url);

    expectShippedCardImage(ogImage);
    expect(String(firstImage(metadata.twitter?.images).url)).toBe(ogImage);
    expect(ogImage).toBe(resolveAgainstMetadataBase(firstImage(rootMetadata.openGraph?.images).url));
  });

  it('never points at the SVG placeholder', () => {
    const offenders = [...sourceFiles('src'), ...sourceFiles('functions')].filter((file) =>
      readFileSync(file, 'utf8').includes('placeholder.svg'),
    );

    expect(offenders).toEqual([]);
  });
});
