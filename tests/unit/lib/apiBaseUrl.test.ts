import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl, resolveApiServerOrigin } from '@/lib/apiBaseUrl';

// The app serves the API on its own origin (/api), in development and in every deployment.
// NEXT_PUBLIC_API_URL can name another API; a loopback one only counts on a loopback page, so
// a bundle built on a developer machine never sends a deployed site's traffic to localhost.
describe('resolveApiBaseUrl', () => {
  it.each([
    // [configuredUrl, pageHostname, expected]
    [undefined, 'localhost', '/api'],
    [undefined, 'serplists.com', '/api'],
    ['http://localhost:9788/api', 'localhost', 'http://localhost:9788/api'],
    ['http://localhost:9788/api', '127.0.0.1', 'http://localhost:9788/api'],
    ['http://localhost:9788/api', 'serplists.com', '/api'],
    ['http://127.0.0.1:9788/api', 'staging.serplists.com', '/api'],
    ['http://[::1]:9788/api', undefined, '/api'],
    ['https://api.example.test/api', 'serplists.com', 'https://api.example.test/api'],
  ] as const)('configured=%s on %s resolves to %s', (configuredUrl, pageHostname, expected) => {
    expect(resolveApiBaseUrl({ configuredUrl, pageHostname })).toBe(expected);
  });
});

describe('resolveApiServerOrigin', () => {
  it('uses the API origin for absolute bases and the page origin for relative ones', () => {
    expect(resolveApiServerOrigin('http://localhost:9788/api', () => 'http://localhost:3000')).toBe(
      'http://localhost:9788',
    );
    expect(resolveApiServerOrigin('/api', () => 'https://serplists.com')).toBe('https://serplists.com');
  });
});
