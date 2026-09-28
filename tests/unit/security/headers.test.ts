import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getVideoEmbedSource } from '@/utils/urlHelpers';

import { CLIPY_VIDEO_LINKS, YOUTUBE_VIDEO_LINKS } from '../../fixtures/videoLinks';

const readDirective = (name: string): string[] => {
  const headers = readFileSync('public/_headers', 'utf8');
  const policy = headers.split('\n').find((line) => line.includes('Content-Security-Policy:')) ?? '';
  const directive = policy
    .replace('Content-Security-Policy:', '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return directive ? directive.split(/\s+/).slice(1) : [];
};

describe('deployment security headers', () => {
  it('allows Tag Manager and public Clipy embeds in frame-src', () => {
    expect(readDirective('frame-src')).toEqual(
      expect.arrayContaining(["'self'", 'https://www.googletagmanager.com', 'https://clipy.online']),
    );
  });

  it('allows every iframe origin that video blocks can produce', () => {
    const frameSources = readDirective('frame-src');

    for (const link of [...YOUTUBE_VIDEO_LINKS, ...CLIPY_VIDEO_LINKS]) {
      const source = getVideoEmbedSource(link);
      expect({ link, kind: source?.kind }).toEqual({ link, kind: 'iframe' });
      expect({ link, allowed: frameSources.includes(new URL(source!.url).origin) }).toEqual({
        link,
        allowed: true,
      });
    }
  });
});
