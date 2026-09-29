import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Providers } from '@/app/providers';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// sonner's Toaster starts listening for toasts in an effect, and drops any toast sent
// before that. React runs sibling effects in tree order, so a page that toasts from its
// first effect (Login's "Email verified" on the verification link's full page load) is
// only heard if the Toaster comes before the pages. The root layout renders every page
// inside these providers.

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <i data-toaster="" /> }));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Toaster placement', () => {
  it('mounts the Toaster once, before the page', () => {
    navigation.reset('/login?verified=1');
    const html = renderToStaticMarkup(
      <Providers>
        <p>Login page</p>
      </Providers>,
    );

    expect(html.split('data-toaster').length - 1).toBe(1);
    expect(html.indexOf('data-toaster')).toBeLessThan(html.indexOf('Login page'));
  });
});
