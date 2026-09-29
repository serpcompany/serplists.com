import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DevLoginBar } from '@/components/DevLoginBar';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    user: null,
  }),
}));

// The bar shows the page's port, which only the browser knows, so it renders after mount:
// these mount it as the browser does and read what it shows then.
let restoreGlobals: () => void = () => {};
let root: Root | null = null;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const mountAt = async (url: string) => {
  navigation.reset(url);
  const container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => root?.render(<DevLoginBar />));
  return container.textContent;
};

describe('DevLoginBar', () => {
  it('stays hidden on blank template editor routes', async () => {
    expect(await mountAt('/dashboard/templates/new')).toBe('');
  });

  it('stays hidden on authenticated dashboard routes used for design QA', async () => {
    expect(await mountAt('/dashboard')).toBe('');
  });

  it('still renders on the login route in development', async () => {
    expect(await mountAt('/login')).toContain('DEV MODE');
  });

  it('renders nothing on the server, so hydration matches', () => {
    navigation.reset('/login');

    expect(renderToStaticMarkup(<DevLoginBar />)).toBe('');
  });
});
