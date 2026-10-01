import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Providers } from '@/app/providers';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

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
  it("mounts the Toaster once, before the page, so a toast from the page's first effect is not dropped", () => {
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
