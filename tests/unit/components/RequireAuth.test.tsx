import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/components/RequireAuth';

const authState = {
  isAuthenticated: false,
  isLoading: false,
  sessionUnavailable: false,
  retrySessionCheck: vi.fn(),
};

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

function render() {
  return renderToStaticMarkup(
    <StaticRouter location="/dashboard">
      <RequireAuth>
        <p>Protected page</p>
      </RequireAuth>
    </StaticRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    Object.assign(authState, { isAuthenticated: false, isLoading: false, sessionUnavailable: false });
  });

  it('renders the page for a signed-in user', () => {
    authState.isAuthenticated = true;
    expect(render()).toContain('Protected page');
  });

  it('offers a retry instead of the login redirect when the session check failed', () => {
    authState.sessionUnavailable = true;
    const html = render();

    expect(html).toContain('Try again');
    expect(html).not.toContain('Protected page');
    expect(html).not.toContain('animate-spin');
  });

  it('shows the spinner while the session check is running', () => {
    authState.isLoading = true;
    const html = render();

    expect(html).toContain('animate-spin');
    expect(html).not.toContain('Try again');
  });
});
