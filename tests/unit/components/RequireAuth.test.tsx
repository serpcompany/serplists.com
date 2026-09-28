import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/components/RequireAuth';
import type { SessionStatus } from '@/contexts/authSession';

const authState = vi.hoisted(() => ({ sessionStatus: 'loading' as SessionStatus }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ retrySession: vi.fn(), sessionStatus: authState.sessionStatus }),
}));

const renderAt = (sessionStatus: SessionStatus) => {
  authState.sessionStatus = sessionStatus;
  return renderToStaticMarkup(
    <StaticRouter location="/dashboard/runs">
      <RequireAuth>
        <div>Protected page</div>
      </RequireAuth>
    </StaticRouter>,
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
});
