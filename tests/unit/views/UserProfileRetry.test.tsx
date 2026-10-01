import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { LoadUserProfileResult } from '@/features/profile/loadUserProfile';

import { click, createFakeContainer, findByText, installFakeDomGlobals, type FakeElement } from '../../fixtures/fakeDom';
import { deferred } from '../../support/deferred';
import { navigation } from '../../support/nextNavigation';
import { settle } from '../../support/queryHookProbe';

const { loadUserProfile } = vi.hoisted(() => ({ loadUserProfile: vi.fn() }));

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);
vi.mock('@/features/profile/loadUserProfile', () => ({ loadUserProfile }));

import UserProfile from '@/views/UserProfile';

const alice: LoadUserProfileResult = {
  kind: 'ok',
  profile: { avatar_url: null, created_at: '2026-01-02 03:04:05', full_name: 'Alice Example', id: 'user-1', username: 'alice' },
  templates: [],
};

let restoreGlobals: () => void = () => undefined;
let root: Root | null = null;

beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});

afterAll(() => restoreGlobals());

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  loadUserProfile.mockReset();
});

async function mountProfile(): Promise<FakeElement> {
  navigation.reset('/profile/alice/', { params: { username: 'alice' } });
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    root?.render(<UserProfile />);
    await settle();
  });
  return container;
}

describe('UserProfile Try again', () => {
  it('shows the loading state, not the earlier failure, until the retried request answers', async () => {
    loadUserProfile.mockResolvedValueOnce({ kind: 'error', message: 'Unable to load this public profile.' });
    const retried = deferred<LoadUserProfileResult>();
    loadUserProfile.mockReturnValueOnce(retried.promise);
    const container = await mountProfile();
    expect(container.textContent).toContain('Unable to load profile');

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Try again'));
      await settle();
    });

    expect(container.textContent).toContain('Loading profile...');
    expect(container.textContent).not.toContain('Unable to load profile');

    await act(async () => {
      retried.resolve(alice);
      await settle();
    });

    expect(container.textContent).toContain('Alice Example');
  });
});
