import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/components/RequireAuth';
import type { SessionStatus } from '@/contexts/authSession';
import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

const authState = vi.hoisted(() => ({ sessionStatus: 'loading' as SessionStatus }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ retrySession: vi.fn(), sessionStatus: authState.sessionStatus }),
}));

const renderAt = (sessionStatus: SessionStatus) => {
  authState.sessionStatus = sessionStatus;
  navigation.reset('/dashboard/runs');
  return renderToStaticMarkup(
    <RequireAuth>
      <div>Protected page</div>
    </RequireAuth>,
  );
};

describe('RequireAuth', () => {
  it('offers a retry instead of the login page when the session check failed', () => {
    const html = renderAt('unavailable');

    expect(html).toContain('data-session-unavailable="true"');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Protected page');
    expect(html).not.toContain('animate-spin');
  });

  it('renders the page for a signed-in user', () => {
    expect(renderAt('authenticated')).toContain('Protected page');
  });

  it('waits while the session is loading', () => {
    const html = renderAt('loading');

    expect(html).toContain('animate-spin');
    expect(html).not.toContain('data-session-unavailable');
    expect(html).not.toContain('Protected page');
  });

  const mountInTheBrowser = async (sessionStatus: SessionStatus) => {
    authState.sessionStatus = sessionStatus;
    navigation.reset('/dashboard/runs/?status=active#recent');
    return renderSettled(
      <RequireAuth>
        <div>Protected page</div>
      </RequireAuth>,
    );
  };

  it('keeps a signed-in user on the page in the browser', async () => {
    await onTheInMemoryBrowser(async () => {
      const { container } = await mountInTheBrowser('authenticated');

      expect(container.textContent).toBe('Protected page');
      expect(navigation.log).toEqual([]);
    });
  });

  it('sends a signed-out visitor to Log in with the page, its query and its hash as the way back', async () => {
    await onTheInMemoryBrowser(async () => {
      await mountInTheBrowser('unauthenticated');

      expect(navigation.log[0]).toEqual({
        kind: 'replace',
        href: `/login/?next=${encodeURIComponent('/dashboard/runs/?status=active#recent')}`,
        via: 'router',
      });
    });
  });
});
