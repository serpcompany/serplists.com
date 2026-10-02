import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ResetPassword from '@/views/ResetPassword';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

vi.mock('@/lib/auth-client', () => ({
  authClient: { resetPassword: vi.fn() },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, logout: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const render = (location: string) => {
  navigation.reset(location);
  return renderToStaticMarkup(
    <ResetPassword />,
  );
};

describe('Reset password page', () => {
  it('shows the new password form for a link with a token', () => {
    const html = render('/reset-password?token=AbC123');

    expect(html).toContain('Set a new password');
    expect(html).toContain('Update password');
  });

  it('offers a new link when the token is missing, for example after a reload of the cleaned URL', () => {
    const html = render('/reset-password');

    expect(html).toContain('Request a new link');
    expect(html).not.toContain('Update password');
  });

  it('offers a new link for an expired token', () => {
    const html = render('/reset-password?error=INVALID_TOKEN');

    expect(html).toContain('Reset link expired');
    expect(html).toContain('Request a new link');
  });
});
