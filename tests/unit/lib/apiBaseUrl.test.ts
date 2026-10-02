import { describe, expect, it } from 'vitest';

import { isLoopbackHostname, resolveApiBaseUrl, resolveApiServerOrigin } from '@/lib/apiBaseUrl';

describe('resolveApiBaseUrl, which uses a loopback NEXT_PUBLIC_API_URL only on a loopback page', () => {
  it.each([
    { configuredUrl: undefined, pageHostname: 'localhost', expected: '/api' },
    { configuredUrl: undefined, pageHostname: 'serplists.com', expected: '/api' },
    { configuredUrl: 'http://localhost:9788/api', pageHostname: 'localhost', expected: 'http://localhost:9788/api' },
    { configuredUrl: 'http://localhost:9788/api', pageHostname: '127.0.0.1', expected: 'http://localhost:9788/api' },
    { configuredUrl: 'http://localhost:9788/api', pageHostname: 'serplists.com', expected: '/api' },
    { configuredUrl: 'http://127.0.0.1:9788/api', pageHostname: 'staging.serplists.com', expected: '/api' },
    { configuredUrl: 'http://[::1]:9788/api', pageHostname: undefined, expected: '/api' },
    { configuredUrl: 'https://api.example.test/api', pageHostname: 'serplists.com', expected: 'https://api.example.test/api' },
  ] as const)('configured=$configuredUrl on $pageHostname resolves to $expected', ({ configuredUrl, pageHostname, expected }) => {
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

describe('isLoopbackHostname', () => {
  it.each(['localhost', 'LOCALHOST.', 'app.localhost', '127.0.0.1', '127.8.9.10', '::1', '[::1]', '0.0.0.0'])(
    'treats %s as this machine',
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(true);
    },
  );

  it.each(['serplists.com', 'localhost.example.com', '128.0.0.1', '10.0.0.1'])('treats %s as another host', (hostname) => {
    expect(isLoopbackHostname(hostname)).toBe(false);
  });
});
