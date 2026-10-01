import { describe, expect, it } from 'vitest';

import { templatePackModules } from '@/data/public-template-packs';
import { renderStaticHeaders } from '@/lib/http/securityHeaders';
import { EMBED_FRAME_ORIGINS } from '@/lib/utils/embedOrigins';
import { getVideoEmbedSource } from '@/utils/urlHelpers';

import { CLIPY_VIDEO_LINKS, YOUTUBE_VIDEO_LINKS } from '../../fixtures/videoLinks';

const productionContentSecurityPolicy = (): Map<string, string[]> => {
  const headers = renderStaticHeaders({ production: true });
  const line = headers.split('\n').find((entry) => entry.includes('Content-Security-Policy:'));
  if (!line) throw new Error('public/_headers has no Content-Security-Policy line');

  const directives = new Map<string, string[]>();
  for (const directive of line.split('Content-Security-Policy:')[1].split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
};

const collectPackVideoValues = (): string[] => {
  const values: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.type === 'video' && typeof record.value === 'string') {
      values.push(record.value);
    }
    Object.values(record).forEach(visit);
  };
  Object.values(templatePackModules).forEach(visit);
  return values;
};

const EVERY_THIRD_PARTY_SCRIPT_ORIGIN_IN_PRODUCTION = [
  'https://www.googletagmanager.com',
  'https://static.cloudflareinsights.com',
  'https://analytics.ahrefs.com',
];

describe('deployment security headers', () => {
  const policy = productionContentSecurityPolicy();
  const frameSources = new Set(policy.get('frame-src') ?? []);
  const scriptSources = new Set(policy.get('script-src') ?? []);
  const connectSources = new Set(policy.get('connect-src') ?? []);

  it('keeps the restrictive defaults', () => {
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(frameSources.has('https:')).toBe(false);
    expect(frameSources.has('*')).toBe(false);
  });

  it('allows every analytics script origin in script-src, and no wildcard, while connect-src lets the beacons report to their own hosts', () => {
    for (const origin of EVERY_THIRD_PARTY_SCRIPT_ORIGIN_IN_PRODUCTION) {
      expect(scriptSources.has(origin), `script-src is missing ${origin}`).toBe(true);
    }
    expect(scriptSources.has('https:')).toBe(false);
    expect(scriptSources.has('*')).toBe(false);
    expect(connectSources.has('https:')).toBe(true);
  });

  it('allows every video embed origin in frame-src', () => {
    expect(frameSources.has("'self'")).toBe(true);
    expect(frameSources.has('https://www.googletagmanager.com')).toBe(true);
    for (const origin of EMBED_FRAME_ORIGINS) {
      expect(frameSources.has(origin), `frame-src is missing ${origin}`).toBe(true);
    }
  });

  it('only frames video sources that the policy allows', () => {
    const packVideos = collectPackVideoValues();
    expect(packVideos.length).toBeGreaterThan(0);

    const inputs = [
      ...packVideos,
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      '<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ"></iframe>',
      '<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe>',
      '<iframe src="https://player.vimeo.com/video/76979871"></iframe>',
      '<iframe src="https://www.youtube.com.evil.test/embed/aqz-KE-bpKQ"></iframe>',
      'https://clipy.online/video/tizg5pl1gkul',
      'https://www.clipy.online/embed/tizg5pl1gkul',
    ];

    for (const input of inputs) {
      const source = getVideoEmbedSource(input);
      if (source?.kind === 'iframe') {
        expect(frameSources.has(new URL(source.url).origin), `${input} would be blocked`).toBe(true);
      }
    }
  });

  it('frames every YouTube and Clipy video link shape on an allowed origin', () => {
    for (const link of [...YOUTUBE_VIDEO_LINKS, ...CLIPY_VIDEO_LINKS]) {
      const source = getVideoEmbedSource(link);
      expect({ link, kind: source?.kind }).toEqual({ link, kind: 'iframe' });
      expect({ link, allowed: frameSources.has(new URL(source!.url).origin) }).toEqual({
        link,
        allowed: true,
      });
    }
  });
});
