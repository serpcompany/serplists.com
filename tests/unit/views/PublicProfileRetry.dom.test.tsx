import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadPublicProfileResult } from '@/features/profile/loadPublicProfile';

import { deferred } from '../../support/deferred';
import { settle } from '../../support/queryHookProbe';
import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

const { loadPublicProfile } = vi.hoisted(() => ({ loadPublicProfile: vi.fn() }));

vi.mock('@/features/profile/loadPublicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/profile/loadPublicProfile')>()),
  loadPublicProfile,
}));

import PublicProfile from '@/views/PublicProfile';

const alice: LoadPublicProfileResult = {
  kind: 'user',
  profile: { avatar_url: null, created_at: '2026-01-02 03:04:05', full_name: 'Alice Example', id: 'user-1', username: 'alice' },
  templates: [],
};

const acme: LoadPublicProfileResult = {
  kind: 'organization',
  organization: { avatar_url: null, description: null, handle: 'Acme-Launch', name: 'Acme Launch' },
  templates: [],
};

beforeEach(() => {
  loadPublicProfile.mockReset();
});

async function onTheProfileAt(handle: string, test: (page: HTMLElement) => Promise<void>) {
  navigation.reset(`/profile/${handle}/`, { routes: ['/profile/[username]'] });
  await onTheInMemoryBrowser(async () => {
    const { container } = await renderSettled(<PublicProfile />, settle);
    await test(container);
  });
}

describe('PublicProfile Try again', () => {
  it('shows the loading state, not the earlier failure, until the retried request answers', async () => {
    loadPublicProfile.mockResolvedValueOnce({ kind: 'error', message: 'Unable to load this public profile.' });
    const retried = deferred<LoadPublicProfileResult>();
    loadPublicProfile.mockReturnValueOnce(retried.promise);

    await onTheProfileAt('alice', async (page) => {
      expect(page.textContent).toContain('Unable to load profile');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
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

describe('PublicProfile in another letter case', () => {
  it("replaces the address with the Organization's stored handle", async () => {
    loadPublicProfile.mockResolvedValue(acme);

    await onTheProfileAt('acme-launch', async () => {
      expect(navigation.log).toEqual([{ kind: 'replace', href: '/profile/Acme-Launch/', via: 'router' }]);
    });
  });

  it('stays on the address that already has the stored handle', async () => {
    loadPublicProfile.mockResolvedValue(acme);

    await onTheProfileAt('Acme-Launch', async (page) => {
      expect(navigation.log).toEqual([]);
      expect(page.textContent).toContain('Acme Launch');
    });
  });
});
