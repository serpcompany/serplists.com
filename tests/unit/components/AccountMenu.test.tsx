import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The account menu lists each console page once. "Dashboard" opened My Templates, the
// console home, which the menu already lists, so it is gone.

const authState = vi.hoisted(() => ({ username: 'alice' as string | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: authState.username },
  }),
}));

// Renders the menu open, with each item as the element it renders (a link, or a div), so the
// items and their hrefs can be read from static markup.
vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dropdown-menu')>();
  const { cloneElement, createElement, isValidElement } = await import('react');
  type Props = { children?: React.ReactNode; render?: React.ReactElement };
  return {
    ...actual,
    DropdownMenu: ({ children }: Props) => createElement('div', null, children),
    DropdownMenuTrigger: ({ children }: Props) => createElement('button', { type: 'button' }, children),
    DropdownMenuContent: ({ children }: Props) => createElement('div', { role: 'menu' }, children),
    DropdownMenuGroup: ({ children }: Props) => createElement('div', { role: 'group' }, children),
    DropdownMenuItem: ({ children, render }: Props) =>
      isValidElement(render)
        ? cloneElement(render as React.ReactElement<Record<string, unknown>>, { role: 'menuitem' }, children)
        : createElement('div', { role: 'menuitem' }, children),
    DropdownMenuLabel: ({ children }: Props) => createElement('div', null, children),
    DropdownMenuSeparator: () => createElement('hr'),
  };
});

import { AccountMenu } from '@/components/layout/AccountMenu';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const renderMenu = () => {
  navigation.reset('/templates/');
  return renderToStaticMarkup(<AccountMenu />);
};

// The menu's items as "label -> href" (no href for a button).
const menuItems = (html: string) =>
  [...html.matchAll(/<(a|div)([^>]*)role="menuitem"([^>]*)>(.*?)<\/\1>/g)].map(([, , before, after, label]) => {
    const href = `${before}${after}`.match(/href="([^"]*)"/)?.[1];
    const text = label.replace(/<[^>]*>/g, '').trim();
    return href ? `${text} -> ${href}` : text;
  });

describe('AccountMenu', () => {
  it('lists My Templates, My Runs, Settings, the Public Profile and Sign out, with no Dashboard', () => {
    expect(menuItems(renderMenu())).toEqual([
      'My Templates -> /dashboard/templates/',
      'My Runs -> /dashboard/runs/',
      'Settings -> /dashboard/settings/',
      'Profile -> /profile/alice/',
      'Sign out',
    ]);
  });

  it('leaves Profile out for a user without a username', () => {
    authState.username = null;
    try {
      expect(menuItems(renderMenu())).not.toContain('Profile -> /profile/alice/');
      expect(menuItems(renderMenu())).toHaveLength(4);
    } finally {
      authState.username = 'alice';
    }
  });
});
