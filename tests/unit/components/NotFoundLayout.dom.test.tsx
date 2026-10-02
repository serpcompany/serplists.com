import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionStatus } from '@/contexts/authSession';
import { NotFoundLayout } from '@/components/NotFoundLayout';
import { navigation } from '../../support/nextNavigation';
import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);

const auth = vi.hoisted(() => ({ sessionStatus: 'loading' as SessionStatus }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ sessionStatus: auth.sessionStatus }),
}));

vi.mock('@/components/Layout', () => ({
  Layout: ({ children, shell }: { children?: React.ReactNode; shell?: string }) => (
    <div data-shell={shell ?? 'from the path'}>{children}</div>
  ),
}));

const shellIn = (html: string) => html.match(/data-shell="([^"]*)"/)?.[1];

const shellAfterMountingAt = async (pathname: string, sessionStatus: SessionStatus) => {
  auth.sessionStatus = sessionStatus;
  navigation.reset(pathname);
  return onTheInMemoryBrowser(async () => {
    const { container } = await renderSettled(<NotFoundLayout>Missing</NotFoundLayout>);
    const shell = container.firstElementChild;
    if (!shell) throw new Error('NotFoundLayout rendered no element');
    return shell.getAttribute('data-shell');
  });
};

beforeEach(() => {
  auth.sessionStatus = 'loading';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NotFoundLayout, the frame of the 404 page that Next.js prerenders once for every missing path', () => {
  it('renders the public shell in the HTML, whoever asks and whatever the path', () => {
    for (const sessionStatus of ['loading', 'authenticated', 'unauthenticated'] as const) {
      auth.sessionStatus = sessionStatus;
      navigation.reset('/dashboard/definitely-missing/');
      expect(shellIn(renderToStaticMarkup(<NotFoundLayout>Missing</NotFoundLayout>)), sessionStatus).toBe('public');
    }
  });

  it('keeps the public shell while the session check is running', async () => {
    expect(await shellAfterMountingAt('/dashboard/definitely-missing/', 'loading')).toBe('public');
  });

  it('shows a signed-in user a missing console page in the console shell', async () => {
    expect(await shellAfterMountingAt('/dashboard/definitely-missing/', 'authenticated')).toBe('console');
    expect(await shellAfterMountingAt('/dashboard/templates/tpl-1/nope/', 'authenticated')).toBe('console');
  });

  it('never shows a signed-out visitor console chrome', async () => {
    expect(await shellAfterMountingAt('/dashboard/definitely-missing/', 'unauthenticated')).toBe('public');
  });

  it('never shows console chrome after a failed session check, which is no proof of a session', async () => {
    expect(await shellAfterMountingAt('/dashboard/definitely-missing/', 'unavailable')).toBe('public');
  });

  it('keeps a missing public page in the public shell for a signed-in user too', async () => {
    expect(await shellAfterMountingAt('/definitely-missing/', 'authenticated')).toBe('public');
  });
});
