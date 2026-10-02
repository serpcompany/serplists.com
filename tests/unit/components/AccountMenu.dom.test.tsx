import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ username: 'alice' as string | null, image: null as string | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: authState.username, image: authState.image },
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

  it('shows the avatar the user uploaded, and the initial when there is none', async () => {
    class ImageThatLoads {
      complete = false;
      naturalWidth = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => {
          this.complete = true;
          this.naturalWidth = 64;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('Image', ImageThatLoads);
    const renderTheTrigger = async () => {
      navigation.reset('/templates/');
      const view = await renderSettled(<AccountMenu />);
      return { view, trigger: view.getByRole('button', { name: 'Account menu' }) };
    };
    try {
      authState.image = 'https://serplists.test/api/uploads/file?key=avatars%2Fuser-1%2Fa.webp';
      const withAvatar = await renderTheTrigger();
      await waitFor(() => expect(withAvatar.trigger.querySelector('img')?.getAttribute('src')).toBe(authState.image));
      withAvatar.view.unmount();

      authState.image = null;
      const withoutAvatar = await renderTheTrigger();
      expect(withoutAvatar.trigger.querySelector('img')).toBeNull();
      expect(withoutAvatar.trigger.textContent).toContain('A');
    } finally {
      authState.image = null;
      vi.unstubAllGlobals();
    }
  });
});
