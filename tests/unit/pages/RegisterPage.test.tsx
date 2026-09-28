import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Register from '@/pages/Register';
import { USER_NAME_MAX_LENGTH } from '@/lib/schemas/userProfileSchema';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ register: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  getAuthStatus: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('Register page', () => {
  it('keeps the return path on the Sign in link so switching pages does not lose it', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location={{ pathname: '/register', state: { from: '/team-invites/abc' } }}>
        <Register />
      </StaticRouter>,
    );

    expect(html).toContain('href="/login?next=%2Fteam-invites%2Fabc"');
  });

  it('reads the return path from next when router state is gone', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/register?next=%2Fteam-invites%2Fabc">
        <Register />
      </StaticRouter>,
    );

    expect(html).toContain('href="/login?next=%2Fteam-invites%2Fabc"');
  });

  it('links plainly to sign in without a return path', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/register">
        <Register />
      </StaticRouter>,
    );

    expect(html).toContain('href="/login"');
  });

  it('limits the name to the length the API accepts', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/register">
        <Register />
      </StaticRouter>,
    );

    expect(html).toMatch(new RegExp(`<input[^>]*id="name"[^>]*maxLength="${USER_NAME_MAX_LENGTH}"`));
  });
});
