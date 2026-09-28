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
  it('limits the name to the length the API accepts', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/register">
        <Register />
      </StaticRouter>,
    );

    expect(html).toMatch(new RegExp(`<input[^>]*id="name"[^>]*maxLength="${USER_NAME_MAX_LENGTH}"`));
  });
});
