import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInEmail, signUpEmail, getSession } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: signInEmail },
    signUp: { email: signUpEmail },
    getSession,
    signOut: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from '@/contexts/CloudflareAuthContext';

type AuthContextValue = ReturnType<typeof useAuth>;

// Renders the provider once and hands back its actions; effects do not run in
// a static render, so only the action being tested talks to the auth client.
function renderAuth(): AuthContextValue {
  let captured: AuthContextValue | undefined;
  function Capture() {
    captured = useAuth();
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Capture />
      </AuthProvider>
    </QueryClientProvider>,
  );
  if (!captured) throw new Error('AuthProvider did not render');
  return captured;
}

// @better-fetch/fetch resolves a failed call as { data: null, error: { ...body, status, statusText } }.
const routerRateLimit = {
  data: null,
  error: { error: 'Too many requests', status: 429, statusText: '' },
};

describe('AuthProvider actions', () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signUpEmail.mockReset();
    getSession.mockReset();
  });

  it('tells a rate-limited sign-in to wait instead of reporting a failed login', async () => {
    signInEmail.mockResolvedValue(routerRateLimit);

    const result = await renderAuth().login('person@example.com', 'a-long-password-1');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Too many attempts. Please wait a few minutes and try again.');
    expect(result.errorCode).toBe('UNKNOWN');
  });

  it('uses the wait from the router body when it is there', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { message: 'Too many requests', error: 'Too many requests', status: 429, retryAfterSeconds: 180 },
    });

    const result = await renderAuth().login('person@example.com', 'a-long-password-1');

    expect(result.error).toBe('Too many attempts. Please try again in 3 minutes.');
  });

  it('shows a router { error } message on sign-up instead of "Registration failed"', async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: {
        error: 'Auth email is temporarily unavailable. Please contact support.',
        code: 'auth_email_unavailable',
        status: 503,
        statusText: '',
      },
    });

    const result = await renderAuth().register('Person', 'person@example.com', 'a-long-password-1');

    expect(result).toMatchObject({
      ok: false,
      error: 'Auth email is temporarily unavailable. Please contact support.',
    });
  });

  it('tells a rate-limited sign-up to wait', async () => {
    signUpEmail.mockResolvedValue(routerRateLimit);

    const result = await renderAuth().register('Person', 'person@example.com', 'a-long-password-1');

    expect(result.error).toBe('Too many attempts. Please wait a few minutes and try again.');
  });

  it('recognizes an unverified email by its code', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email', status: 403 },
    });

    const result = await renderAuth().login('person@example.com', 'a-long-password-1');

    expect(result.errorCode).toBe('EMAIL_NOT_VERIFIED');
  });

  it("keeps Better Auth's own messages", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password', status: 401 },
    });

    const result = await renderAuth().login('person@example.com', 'wrong-password-1');

    expect(result).toEqual({ ok: false, error: 'Invalid email or password', errorCode: 'UNKNOWN' });
  });
});
