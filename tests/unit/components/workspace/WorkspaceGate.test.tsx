import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// When the teams request fails before the stored Organization is confirmed, console pages
// show an error with Retry instead of silently acting in Personal, and the switcher never
// claims the tab is in Personal.

const personal = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' };
const workspaceState = vi.hoisted(() => ({ status: 'error' as 'ready' | 'loading' | 'error' }));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: personal,
    isWorkspaceLoading: workspaceState.status !== 'ready',
    retryWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    workspaces: [personal],
    workspaceStatus: workspaceState.status,
  }),
}));

import { WorkspaceGate } from '@/components/workspace/WorkspaceGate';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { navigation } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

const renderGate = () =>
  renderToStaticMarkup(
    <WorkspaceGate>
      <p>My Templates page</p>
    </WorkspaceGate>,
  );

const renderSwitcher = () => {
  navigation.reset('/dashboard/templates');
  return renderToStaticMarkup(
    <WorkspaceSwitcher />,
  );
};

describe('WorkspaceGate', () => {
  beforeEach(() => {
    workspaceState.status = 'error';
  });

  it('shows the error with Retry and a way to Personal instead of the page', () => {
    const html = renderGate();

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toContain('Retry');
    expect(html).toContain('Continue in Personal');
    expect(html).not.toContain('My Templates page');
  });

  it.each(['ready', 'loading'] as const)('renders the page when the context is %s', (status) => {
    workspaceState.status = status;

    expect(renderGate()).toBe('<p>My Templates page</p>');
  });
});

describe('WorkspaceSwitcher while the Organization is unconfirmed', () => {
  it('does not label the tab Personal after the teams request failed', () => {
    workspaceState.status = 'error';
    const html = renderSwitcher();

    expect(html).toContain('Organizations unavailable');
    expect(html).not.toContain('>Personal<');
  });

  it('does not label the tab Personal while the teams request loads', () => {
    workspaceState.status = 'loading';

    expect(renderSwitcher()).toContain('Loading...');
  });

  it('shows the active context once it is known', () => {
    workspaceState.status = 'ready';

    expect(renderSwitcher()).toContain('>Personal<');
  });
});
