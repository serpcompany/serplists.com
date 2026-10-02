import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Register from '@/views/Register';
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

const renderAt = (url: string) => {
  navigation.reset(url);
  return renderToStaticMarkup(<Register />);
};

describe('Register page', () => {
  it('keeps the return path on the Sign in link so switching pages does not lose it', () => {
    const html = renderAt('/register/?next=%2Fteam-invites%2Fabc%2F%3Fx%3D1%23h');

    expect(html).toContain('href="/login/?next=%2Fteam-invites%2Fabc%2F%3Fx%3D1%23h"');
  });

  it('reads the return path from next, in its canonical form even from an older link', () => {
    const html = renderAt('/register/?next=%2Fteam-invites%2Fabc');

    expect(html).toContain('href="/login/?next=%2Fteam-invites%2Fabc%2F"');
  });

  it('links plainly to sign in without a return path', () => {
    expect(renderAt('/register/')).toContain('href="/login/"');
  });

  it('never carries a return path to another origin', () => {
    const html = renderAt('/register/?next=https%3A%2F%2Fevil.example%2Fsteal');

    expect(html).toContain('href="/login/"');
    expect(html).not.toContain('evil.example');
  });

  it('limits the name to the length the API accepts', () => {
    expect(renderAt('/register/')).toMatch(new RegExp(`<input[^>]*id="name"[^>]*maxLength="${USER_NAME_MAX_LENGTH}"`));
  });
});
