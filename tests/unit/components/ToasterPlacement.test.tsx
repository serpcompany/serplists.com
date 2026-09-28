import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';

// sonner's Toaster starts listening for toasts in an effect, and drops any toast sent
// before that. React runs sibling effects in tree order, so a page that toasts from its
// first effect (Login's "Email verified" on the verification link's full page load) is
// only heard if the Toaster comes before the pages.

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <i data-toaster="" /> }));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/components/routing/ScrollToTop', () => ({ ScrollToTop: () => null }));

import { AppShell } from '@/components/AppShell';

describe('Toaster placement', () => {
  it('mounts the Toaster once, before the routed page', async () => {
    const html = await renderDataRoutes(
      [{ element: <AppShell />, children: [{ path: '/login', element: <p>Login page</p> }] }],
      '/login?verified=1',
    );

    expect(html.split('data-toaster').length - 1).toBe(1);
    expect(html.indexOf('data-toaster')).toBeLessThan(html.indexOf('Login page'));
  });
});
