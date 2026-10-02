import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ username: 'alice' as string | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: authState.username },
  }),
}));

import { AccountMenu } from '@/components/layout/AccountMenu';

import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

async function menuItemLabelsWithHrefs() {
  navigation.reset('/templates/');
  await renderSettled(<AccountMenu />);
  return (await openTheMenu('Account menu')).map((menuItem) => {
    const text = menuItem.textContent.trim();
    const href = menuItem.getAttribute('href');
    return href ? `${text} -> ${href}` : text;
  });
}

describe('AccountMenu', () => {
  it('lists each console page once, the Public Profile and Sign out, with no Dashboard item, which only opened My Templates again', async () => {
    expect(await menuItemLabelsWithHrefs()).toEqual([
      'My Templates -> /dashboard/templates/',
      'My Runs -> /dashboard/runs/',
      'Settings -> /dashboard/settings/',
      'Profile -> /profile/alice/',
      'Sign out',
    ]);
  });

  it('leaves Profile out for a user without a username', async () => {
    authState.username = null;
    try {
      const labels = await menuItemLabelsWithHrefs();
      expect(labels).not.toContain('Profile -> /profile/alice/');
      expect(labels).toHaveLength(4);
    } finally {
      authState.username = 'alice';
    }
  });
});
