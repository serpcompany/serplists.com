import { describe, expect, it, vi } from 'vitest';
import { getApiEnv } from '@functions/api/env';

const SECRET = 'test-better-auth-secret-32-chars-minimum!!';

function parse(overrides: Record<string, string>) {
  return () => getApiEnv({ BETTER_AUTH_SECRET: SECRET, ...overrides } as any);
}

describe('getApiEnv origin variables', () => {
  it.each([
    'serplists.com',
    'localhost:8080',
    'serplists.com:443',
    '*',
    '*.serplists.com',
    'https://*.serplists.com',
    ',',
    ' , ',
    'https://ok.com,bad',
    'https://ok.com, localhost:8080',
    'file:///index.html',
  ])('rejects CORS_ALLOWED_ORIGINS=%j', (value) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(parse({ CORS_ALLOWED_ORIGINS: value })).toThrow();
    vi.restoreAllMocks();
  });

  it.each([
    'http://localhost:8080, https://serplists.com/',
    'https://staging.serplists.com,https://staging.serp-checklists.pages.dev',
    'http://localhost:8080,http://localhost:4173,',
    'https://serplists.com',
  ])('accepts CORS_ALLOWED_ORIGINS=%j', (value) => {
    expect(parse({ CORS_ALLOWED_ORIGINS: value })).not.toThrow();
  });

  it.each(['localhost:8080', 'serplists.com', 'file:///index.html', 'https://*.serplists.com'])(
    'rejects FRONTEND_URL=%j',
    (value) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(parse({ FRONTEND_URL: value })).toThrow();
      vi.restoreAllMocks();
    },
  );

  it('accepts an http(s) FRONTEND_URL', () => {
    expect(parse({ FRONTEND_URL: 'http://localhost:8080' })).not.toThrow();
    expect(parse({ FRONTEND_URL: 'https://serplists.com/app' })).not.toThrow();
  });
});
