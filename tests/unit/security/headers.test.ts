import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deployment security headers', () => {
  it('allows public Clipy embeds in the content security policy', () => {
    const headers = readFileSync('public/_headers', 'utf8');
    const policy = headers.split('\n').find((line) => line.includes('Content-Security-Policy:'));

    expect(policy).toContain("frame-src 'self' https://www.googletagmanager.com https://clipy.online");
  });
});
