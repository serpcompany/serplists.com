import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EMBED_FRAME_ORIGINS } from '@/lib/utils/embedOrigins';
import { getVideoEmbedSource } from '@/utils/urlHelpers';

const readContentSecurityPolicy = (): Map<string, string[]> => {
  const headers = readFileSync('public/_headers', 'utf8');
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

describe('deployment security headers', () => {
  const policy = readContentSecurityPolicy();
  const frameSources = new Set(policy.get('frame-src') ?? []);

  it('keeps the restrictive defaults', () => {
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(frameSources.has('https:')).toBe(false);
    expect(frameSources.has('*')).toBe(false);
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
});
