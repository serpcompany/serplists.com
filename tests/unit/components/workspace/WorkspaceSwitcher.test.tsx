import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A Personal context never waits on the teams request, but when it failed the switcher must
// not read as "no Organizations": its menu says so and offers a retry.

const personal = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' };
const workspaceState = vi.hoisted(() => ({
  status: 'ready' as 'ready' | 'loading' | 'error',
  teamsUnavailable: false,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: personal,
    isWorkspaceLoading: workspaceState.status !== 'ready',
    retryWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    teamsUnavailable: workspaceState.teamsUnavailable,
    workspaces: [personal],
    workspaceStatus: workspaceState.status,
  }),
}));

// Renders the menu open, so its items can be read from static markup.
vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dropdown-menu')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    DropdownMenuItem: ({ children }: { children?: React.ReactNode }) =>
      createElement('div', { role: 'menuitem' }, children),
    DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) =>
      createElement('div', null, children),
    DropdownMenuSeparator: () => createElement('hr'),
  };
});

import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { navigation } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

const renderSwitcher = () => {
  navigation.reset('/dashboard/settings');
  // The switcher lives in the console sidebar.
  return renderToStaticMarkup(
    <SidebarProvider>
      <WorkspaceSwitcher />
    </SidebarProvider>,
  );
};

const count = (html: string, text: string) => html.split(text).length - 1;

describe('WorkspaceSwitcher in Personal', () => {
  beforeEach(() => {
    workspaceState.status = 'ready';
    workspaceState.teamsUnavailable = false;
  });

  it('says the Organizations could not load and offers a retry when the teams request failed', () => {
    workspaceState.teamsUnavailable = true;
    const html = renderSwitcher();

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toContain('Retry loading Organizations');
    // The tab is in Personal, and Personal work is not blocked.
    expect(html).toContain('>Personal<');
  });

  it('offers no retry once the teams request succeeded', () => {
    const html = renderSwitcher();

    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(html).not.toContain('Retry loading Organizations');
  });

  it('offers the retry once when the stored Organization is unconfirmed', () => {
    workspaceState.status = 'error';
    workspaceState.teamsUnavailable = true;
    const html = renderSwitcher();

    expect(count(html, 'Retry loading Organizations')).toBe(1);
    expect(html).toContain('Organizations unavailable');
  });
});
