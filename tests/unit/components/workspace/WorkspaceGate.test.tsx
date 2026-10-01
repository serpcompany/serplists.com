import '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { navigation } from '../../../support/nextNavigation';

const renderGate = () =>
  renderToStaticMarkup(
    <WorkspaceGate>
      <p>My Templates page</p>
    </WorkspaceGate>,
  );

const renderSwitcherInConsoleSidebar = () => {
  navigation.reset('/dashboard/templates');
  return renderToStaticMarkup(
    <SidebarProvider>
      <WorkspaceSwitcher />
    </SidebarProvider>,
  );
};

describe('WorkspaceGate when the teams request failed before the stored Organization was confirmed', () => {
  beforeEach(() => {
    workspaceState.status = 'error';
  });

  it('shows the error with Retry and a way to Personal instead of the page, rather than silently acting in Personal', () => {
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
    const html = renderSwitcherInConsoleSidebar();

    expect(html).toContain('Organizations unavailable');
    expect(html).not.toContain('>Personal<');
  });

  it('does not label the tab Personal while the teams request loads', () => {
    workspaceState.status = 'loading';

    expect(renderSwitcherInConsoleSidebar()).toContain('Loading...');
  });

  it('shows the active context once it is known', () => {
    workspaceState.status = 'ready';

    expect(renderSwitcherInConsoleSidebar()).toContain('>Personal<');
  });
});
