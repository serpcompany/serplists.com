import { describe, expect, it } from 'vitest';
import { rejectUnsafeAuthRequest } from '@functions/api/utils/auth-request-guard';

const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  FRONTEND_URL: 'http://localhost:8080',
  CORS_ALLOWED_ORIGINS: 'https://preview.serplists.com',
} as any;

function authRequest(method: string, headers: Record<string, string>) {
  return new Request('http://localhost:8788/api/auth/sign-in/email', { method, headers });
}

const JSON_TYPE = { 'Content-Type': 'application/json' };

describe('rejectUnsafeAuthRequest', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('leaves %s requests (session checks, email links) alone', (method) => {
    expect(rejectUnsafeAuthRequest(authRequest(method, { Origin: 'https://evil.example' }), env)).toBeNull();
  });

  it.each([
    ['no Content-Type', {}],
    ['a form', { 'Content-Type': 'application/x-www-form-urlencoded' }],
    ['multipart', { 'Content-Type': 'multipart/form-data; boundary=x' }],
    ['text/plain', { 'Content-Type': 'text/plain' }],
    ['text/plain naming JSON in a parameter', { 'Content-Type': 'text/plain; x=application/json' }],
    ['a JSON-like subtype', { 'Content-Type': 'application/json-patch+json' }],
  ])('refuses a POST with %s with 415', (_label, headers) => {
    expect(rejectUnsafeAuthRequest(authRequest('POST', headers), env)?.status).toBe(415);
  });

  it.each([
    ['application/json; charset=utf-8'],
    ['APPLICATION/JSON'],
    [' application/json '],
  ])('accepts the JSON media type written as %j', (contentType) => {
    expect(rejectUnsafeAuthRequest(authRequest('POST', { 'Content-Type': contentType }), env)).toBeNull();
  });

  it.each([
    ['a foreign origin', { Origin: 'https://evil.example' }],
    ['a sibling origin on another port', { Origin: 'http://localhost:9999' }],
    ['Origin: null', { Origin: 'null' }],
    ['a cross-site fetch with no Origin', { 'Sec-Fetch-Site': 'cross-site' }],
    ['a trusted origin over the wrong scheme', { Origin: 'https://localhost:8080' }],
  ])('refuses a JSON POST from %s with 403', (_label, headers) => {
    expect(rejectUnsafeAuthRequest(authRequest('POST', { ...JSON_TYPE, ...headers }), env)?.status).toBe(403);
  });

  it.each([
    ['the API origin', { Origin: 'http://localhost:8788' }],
    ['FRONTEND_URL', { Origin: 'http://localhost:8080' }],
    ['CORS_ALLOWED_ORIGINS', { Origin: 'https://preview.serplists.com' }],
    ['a script with no Origin', {}],
    ['a same-origin fetch with no Origin', { 'Sec-Fetch-Site': 'same-origin' }],
    ['a trusted origin even when the browser calls it same-site', { Origin: 'http://localhost:8080', 'Sec-Fetch-Site': 'same-site' }],
  ])('accepts a JSON POST from %s', (_label, headers) => {
    expect(rejectUnsafeAuthRequest(authRequest('POST', { ...JSON_TYPE, ...headers }), env)).toBeNull();
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('applies the same rules to %s', (method) => {
    expect(rejectUnsafeAuthRequest(authRequest(method, {}), env)?.status).toBe(415);
    expect(
      rejectUnsafeAuthRequest(authRequest(method, { ...JSON_TYPE, Origin: 'https://evil.example' }), env)?.status,
    ).toBe(403);
  });
});
