import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ username: 'alice' as string | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: authState.username },
  }),
}));

vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/dropdown-menu')>()),
  ...(await import('../../support/overlaysInPlace')).dropdownMenuRenderedOpen,
}));

import { AccountMenu } from '@/components/layout/AccountMenu';

const renderMenu = () => {
  navigation.reset('/templates/');
  return renderToStaticMarkup(<AccountMenu />);
};

const menuItemLabelsWithHrefs = (html: string) =>
  [...html.matchAll(/<(a|div)([^>]*)role="menuitem"([^>]*)>(.*?)<\/\1>/g)].map(([, , before, after, label]) => {
    const href = `${before}${after}`.match(/href="([^"]*)"/)?.[1];
    const text = label.replace(/<[^>]*>/g, '').trim();
    return href ? `${text} -> ${href}` : text;
  });

describe('AccountMenu', () => {
  it('lists each console page once, the Public Profile and Sign out, with no Dashboard item, which only opened My Templates again', () => {
    expect(menuItemLabelsWithHrefs(renderMenu())).toEqual([
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
      expect(menuItemLabelsWithHrefs(renderMenu())).not.toContain('Profile -> /profile/alice/');
      expect(menuItemLabelsWithHrefs(renderMenu())).toHaveLength(4);
    } finally {
      authState.username = 'alice';
    }
  });
});
