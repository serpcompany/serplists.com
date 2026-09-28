import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Login from '@/pages/Login';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    sendVerificationEmail: vi.fn(),
  },
  getAuthStatus: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe('Login page', () => {
  it('uses the feature-wired sign-in surface without dead auth affordances', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <Login />
      </StaticRouter>,
    );

    expect(html).toContain('Welcome back');
    expect(html).toContain('Forgot password?');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('Remember me for 30 days');
    expect(html).not.toContain('or continue with');
    expect(html).not.toContain('Google');
    expect(html).not.toContain('GitHub');
    expect(html).not.toContain('What happens after sign in');
  });

  it('offers a new verification email when the verification link failed', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/login?verified=1&error=token_expired">
        <Login />
      </StaticRouter>,
    );

    expect(html).toContain('Resend verification email');
    expect(html).toContain('That verification link has expired.');
    expect(html).not.toContain('Email verified');
  });

  it('carries the return path to sign-up so a new invitee comes back to the invite', () => {
    const html = renderToStaticMarkup(
      <StaticRouter
        location={{
          pathname: '/login',
          state: { from: { pathname: '/team-invites/abc', search: '?x=1', hash: '#h' } },
        }}
      >
        <Login />
      </StaticRouter>,
    );

    expect(html).toContain('href="/register?next=%2Fteam-invites%2Fabc%3Fx%3D1%23h"');
  });

  it('reads the return path from next after the email verification round trip', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/login?verified=1&next=%2Fteam-invites%2Fabc">
        <Login />
      </StaticRouter>,
    );

    expect(html).toContain('href="/register?next=%2Fteam-invites%2Fabc"');
  });

  it('does not offer a resend after a successful verification', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/login?verified=1">
        <Login />
      </StaticRouter>,
    );

    expect(html).not.toContain('Resend verification email');
  });
});
