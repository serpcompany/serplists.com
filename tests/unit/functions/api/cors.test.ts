import { describe, expect, it } from 'vitest';
import {
  applyCorsHeaders,
  buildCorsPreflightResponse,
  resolveConfiguredCorsOrigins,
  resolveCorsOrigin,
} from '@functions/api/utils/cors';
import { apiEnv } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';

function request(origin?: string, method = 'GET') {
  return new Request('https://api.serplists.com/api/templates', {
    method,
    headers: origin === undefined ? {} : { Origin: origin },
  });
}

const MALFORMED_ALLOWLISTS: Array<[string, Partial<Env>]> = [
  ['a bare host', { CORS_ALLOWED_ORIGINS: 'serplists.com' }],
  ['a wildcard host', { CORS_ALLOWED_ORIGINS: '*.serplists.com' }],
  ['a wildcard URL', { CORS_ALLOWED_ORIGINS: 'https://*.serplists.com' }],
  ['a star', { CORS_ALLOWED_ORIGINS: '*' }],
  ['host:port with no scheme', { CORS_ALLOWED_ORIGINS: 'localhost:8080' }],
  ['host:443 with no scheme', { CORS_ALLOWED_ORIGINS: 'serplists.com:443' }],
  ['only commas and spaces', { CORS_ALLOWED_ORIGINS: ' , ' }],
  ['a malformed FRONTEND_URL', { FRONTEND_URL: 'localhost:8080' }],
  ['a file URL', { FRONTEND_URL: 'file:///index.html' }],
];

describe('resolveCorsOrigin', () => {
  it.each(MALFORMED_ALLOWLISTS)('never reflects a foreign or null Origin when the allowlist is %s', (_label, vars) => {
    const env = apiEnv(vars);
    for (const origin of ['https://evil.example', 'null']) {
      expect(resolveCorsOrigin(request(origin), env)).toBeNull();

      const response = applyCorsHeaders(new Response('{}'), request(origin), env);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();

      const preflight = buildCorsPreflightResponse(request(origin, 'OPTIONS'), env);
      expect(preflight.status).toBe(403);
      expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    }
  });

  it('keeps the valid entries of a partly malformed list', () => {
    const env = apiEnv({ CORS_ALLOWED_ORIGINS: 'https://ok.serplists.com, localhost:8080' });

    expect(resolveCorsOrigin(request('https://ok.serplists.com'), env)).toBe('https://ok.serplists.com');
    expect(resolveCorsOrigin(request('https://evil.example'), env)).toBeNull();
    expect(resolveCorsOrigin(request('null'), env)).toBeNull();
  });

  it('reflects configured origins, including lists with spaces, trailing commas and paths', () => {
    const env = apiEnv({
      FRONTEND_URL: 'https://app.serplists.com/some/path',
      CORS_ALLOWED_ORIGINS: ' http://localhost:8080 , https://serplists.com/, ',
    });

    for (const origin of ['https://app.serplists.com', 'http://localhost:8080', 'https://serplists.com']) {
      expect(resolveCorsOrigin(request(origin), env)).toBe(origin);
    }
    expect(resolveCorsOrigin(request(), env)).toBe('*');
  });

  it('keeps the local-dev fallback when neither variable is set, except for Origin: null', () => {
    for (const env of [apiEnv(), apiEnv({ FRONTEND_URL: '', CORS_ALLOWED_ORIGINS: '' })]) {
      expect(resolveCorsOrigin(request('http://localhost:5173'), env)).toBe('http://localhost:5173');
      expect(resolveCorsOrigin(request(), env)).toBe('*');
      expect(resolveCorsOrigin(request('null'), env)).toBeNull();
    }
  });
});

describe('resolveConfiguredCorsOrigins', () => {
  it('never trusts the opaque "null" origin', () => {
    const env = apiEnv({ FRONTEND_URL: 'localhost:8080', CORS_ALLOWED_ORIGINS: 'serplists.com:443,https://ok.com' });

    expect(resolveConfiguredCorsOrigins(env)).toEqual(['https://ok.com']);
  });
});
