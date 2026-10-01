import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { LoadUserProfileResult } from '@/features/profile/loadUserProfile';

import { click, createFakeContainer, findByText, installFakeDomGlobals, type FakeElement } from '../../fixtures/fakeDom';
import { deferred } from '../../support/deferred';
import { settle } from '../../support/queryHookProbe';

const { loadUserProfile } = vi.hoisted(() => ({ loadUserProfile: vi.fn() }));

vi.mock('@/features/profile/loadUserProfile', () => ({ loadUserProfile }));

import UserProfile from '@/views/UserProfile';

const alice: LoadUserProfileResult = {
  kind: 'ok',
  profile: { avatar_url: null, created_at: '2026-01-02 03:04:05', full_name: 'Alice Example', id: 'user-1', username: 'alice' },
  templates: [],
};

async function onAlicesProfile(test: (page: FakeElement) => Promise<void>) {
  const restoreGlobals = installFakeDomGlobals(navigation.window);
  navigation.reset('/profile/alice/', { params: { username: 'alice' } });
  const page = createFakeContainer();
  const root = createRoot(page as unknown as Element);
  try {
    await act(async () => {
      root.render(<UserProfile />);
      await settle();
    });
    await test(page);
  } finally {
    act(() => root.unmount());
    restoreGlobals();
  }
}

describe('UserProfile Try again', () => {
  it('shows the loading state, not the earlier failure, until the retried request answers', async () => {
    loadUserProfile.mockResolvedValueOnce({ kind: 'error', message: 'Unable to load this public profile.' });
    const retried = deferred<LoadUserProfileResult>();
    loadUserProfile.mockReturnValueOnce(retried.promise);

    await onAlicesProfile(async (page) => {
      expect(page.textContent).toContain('Unable to load profile');

      await act(async () => {
        click(page, findByText(page, 'BUTTON', 'Try again'));
        await settle();
      });

      expect(page.textContent).toContain('Loading profile...');
      expect(page.textContent).not.toContain('Unable to load profile');

      await act(async () => {
        retried.resolve(alice);
        await settle();
      });

      expect(page.textContent).toContain('Alice Example');
    });
  });
});
