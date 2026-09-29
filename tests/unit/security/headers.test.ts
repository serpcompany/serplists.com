import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderStaticHeaders } from '@/lib/http/securityHeaders';
import { EMBED_FRAME_ORIGINS } from '@/lib/utils/embedOrigins';
import { getVideoEmbedSource } from '@/utils/urlHelpers';

import { CLIPY_VIDEO_LINKS, YOUTUBE_VIDEO_LINKS } from '../../fixtures/videoLinks';

// public/_headers as a production build writes it (scripts/generate-static-headers.ts), the
// same policy next.config.ts sends with pages.
const readContentSecurityPolicy = (): Map<string, string[]> => {
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
  const packDir = 'src/data/public-template-packs';
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
  for (const file of readdirSync(packDir).filter((name) => name.endsWith('.json'))) {
    visit(JSON.parse(readFileSync(path.join(packDir, file), 'utf8')));
  }
  return values;
};

// Every third-party script origin the production site loads: Google Tag Manager
// (the root layout), the Cloudflare Web Analytics beacon (injected by Cloudflare), and
// Ahrefs Web Analytics (loaded by a GTM tag).
const ANALYTICS_SCRIPT_ORIGINS = [
  'https://www.googletagmanager.com',
  'https://static.cloudflareinsights.com',
  'https://analytics.ahrefs.com',
];

describe('deployment security headers', () => {
  const policy = readContentSecurityPolicy();
  const frameSources = new Set(policy.get('frame-src') ?? []);
  const scriptSources = new Set(policy.get('script-src') ?? []);
  const connectSources = new Set(policy.get('connect-src') ?? []);

  it('keeps the restrictive defaults', () => {
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(frameSources.has('https:')).toBe(false);
    expect(frameSources.has('*')).toBe(false);
  });

  it('allows every analytics script origin in script-src, and no wildcard', () => {
    for (const origin of ANALYTICS_SCRIPT_ORIGINS) {
      expect(scriptSources.has(origin), `script-src is missing ${origin}`).toBe(true);
    }
    expect(scriptSources.has('https:')).toBe(false);
    expect(scriptSources.has('*')).toBe(false);
    // The beacons report to their own hosts (cloudflareinsights.com, analytics.ahrefs.com).
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
