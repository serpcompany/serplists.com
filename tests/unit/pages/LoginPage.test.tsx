import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
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
});
