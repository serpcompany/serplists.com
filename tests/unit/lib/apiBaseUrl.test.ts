import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl, resolveApiServerOrigin } from '@/lib/apiBaseUrl';

describe('resolveApiBaseUrl', () => {
  it.each([
    // [isDev, configuredUrl, pageHostname, expected]
    [true, undefined, 'localhost', 'http://localhost:8788/api'],
    [true, 'http://localhost:9788/api', 'localhost', 'http://localhost:9788/api'],
    [false, undefined, 'serplists.com', '/api'],
    [false, 'http://localhost:8788/api', 'serplists.com', '/api'],
    [false, 'http://127.0.0.1:8788/api', 'staging.serplists.com', '/api'],
    [false, 'http://[::1]:8788/api', undefined, '/api'],
    [false, 'http://localhost:8788/api', 'localhost', 'http://localhost:8788/api'],
    [false, 'http://localhost:8788/api', '127.0.0.1', 'http://localhost:8788/api'],
    [false, 'https://api.example.test/api', 'serplists.com', 'https://api.example.test/api'],
  ] as const)('dev=%s configured=%s on %s resolves to %s', (isDev, configuredUrl, pageHostname, expected) => {
    expect(resolveApiBaseUrl({ isDev, configuredUrl, pageHostname })).toBe(expected);
  });
});

describe('resolveApiServerOrigin', () => {
  it('uses the API origin for absolute bases and the page origin for relative ones', () => {
    expect(resolveApiServerOrigin('http://localhost:8788/api', () => 'http://localhost:8080')).toBe(
      'http://localhost:8788',
    );
    expect(resolveApiServerOrigin('/api', () => 'https://serplists.com')).toBe('https://serplists.com');
  });
});
