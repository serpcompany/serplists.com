import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileDirectoryEntry, ProfileDirectoryQuery } from '@/lib/schemas/profileDirectory';

import { settle } from '../../support/queryHookProbe';
import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

type DirectoryState = {
  listQuery: { data: ProfileDirectoryEntry[] | undefined; isError: boolean; isLoading: boolean };
  nextCursor: string | null;
  previousCursor: string | null;
  retry: () => void;
};

const { useProfileDirectory } = vi.hoisted(() => ({ useProfileDirectory: vi.fn<(query: ProfileDirectoryQuery) => DirectoryState>() }));

vi.mock('@/features/profile/useProfileDirectory', () => ({ useProfileDirectory }));

import { metadata } from '@/app/(site)/profiles/page';
import ProfilesDirectory from '@/views/ProfilesDirectory';

const alice: ProfileDirectoryEntry = { handle: 'alice', name: 'Alice Example', avatar_url: null, public_template_count: 1 };
const bob: ProfileDirectoryEntry = { handle: 'bob', name: null, avatar_url: null, public_template_count: 3 };
const acme: ProfileDirectoryEntry = { handle: 'Acme-Launch', name: 'Acme Launch', avatar_url: null, public_template_count: 0 };

const loaded = (profiles: ProfileDirectoryEntry[], cursors: Partial<Pick<DirectoryState, 'nextCursor' | 'previousCursor'>> = {}): DirectoryState => ({
  listQuery: { data: profiles, isError: false, isLoading: false },
  nextCursor: cursors.nextCursor ?? null,
  previousCursor: cursors.previousCursor ?? null,
  retry: vi.fn(),
});

beforeEach(() => {
  useProfileDirectory.mockReset();
});

async function onTheDirectoryAt(location: string, test: (page: HTMLElement) => Promise<void>) {
  navigation.reset(location, { routes: ['/profiles'] });
  await onTheInMemoryBrowser(async () => {
    const { container } = await renderSettled(<ProfilesDirectory />, settle);
    await test(container);
  });
}

const linkPaths = (scope: HTMLElement) =>
  within(scope).queryAllByRole('link').map((link) => link.getAttribute('href'));

describe('the Profiles directory page', () => {
  it('is indexable with its canonical URL on the first page', () => {
    expect(metadata.robots).toBe('index, follow');
    expect(metadata.alternates?.canonical).toBe('https://serplists.com/profiles/');
  });

  it('shows People by default, each card linking to its one canonical profile with its public Template count', async () => {
    useProfileDirectory.mockReturnValue(loaded([alice, bob]));

    await onTheDirectoryAt('/profiles/', async (page) => {
      expect(useProfileDirectory).toHaveBeenLastCalledWith({ collection: 'people' });
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Profiles');
      expect(screen.getByRole('tab', { name: 'People' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByRole('tab', { name: 'Organizations' }).getAttribute('aria-selected')).toBe('false');
      expect(linkPaths(page)).toEqual(['/profile/alice/', '/profile/bob/']);
      expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Alice Example', '@bob']);
      expect(page.textContent).toContain('1 public template');
      expect(page.textContent).toContain('3 public templates');
      expect(screen.queryByRole('navigation', { name: 'People pages' })).toBeNull();
    });
  });

  it('switches to Organizations in the URL, without a new history entry', async () => {
    useProfileDirectory.mockImplementation((query) => loaded(query.collection === 'organizations' ? [acme] : [alice]));

    await onTheDirectoryAt('/profiles/?after=alice', async (page) => {
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: 'Organizations' }));
        await settle();
      });

      expect(navigation.url()).toBe('/profiles/?collection=organizations');
      expect(navigation.log).toEqual([]);
      expect(useProfileDirectory).toHaveBeenLastCalledWith({ collection: 'organizations' });
      expect(linkPaths(page)).toEqual(['/profile/Acme-Launch/']);
      expect(page.textContent).toContain('0 public templates');
    });
  });

  it('links the previous and next pages of the collection through their cursors', async () => {
    useProfileDirectory.mockReturnValue(loaded([acme], { previousCursor: 'Acme-Launch', nextCursor: 'zeta' }));

    await onTheDirectoryAt('/profiles/?collection=organizations&after=a', async () => {
      expect(useProfileDirectory).toHaveBeenLastCalledWith({ collection: 'organizations', after: 'a' });
      const pager = screen.getByRole('navigation', { name: 'Organizations pages' });
      expect(linkPaths(pager)).toEqual([
        '/profiles/?collection=organizations&before=Acme-Launch',
        '/profiles/?collection=organizations&after=zeta',
      ]);
    });
  });

  it('reads an address it does not understand as the first page of People', async () => {
    useProfileDirectory.mockReturnValue(loaded([alice]));

    await onTheDirectoryAt('/profiles/?collection=teams&after=a&before=b', async () => {
      expect(useProfileDirectory).toHaveBeenLastCalledWith({ collection: 'people' });
    });
  });
});

describe('the states of a Profiles collection', () => {
  it('says so while it loads, and offers Retry when it fails', async () => {
    useProfileDirectory.mockReturnValue({ ...loaded([]), listQuery: { data: undefined, isError: false, isLoading: true } });
    await onTheDirectoryAt('/profiles/', async (page) => {
      expect(page.textContent).toContain('Loading people...');
    });

    const failed = { ...loaded([]), listQuery: { data: undefined, isError: true, isLoading: false } };
    useProfileDirectory.mockReturnValue(failed);
    await onTheDirectoryAt('/profiles/?collection=organizations', async (page) => {
      expect(page.textContent).toContain('Unable to load Organizations.');
      fireEvent.click(within(page).getByRole('button', { name: 'Retry' }));
      expect(failed.retry).toHaveBeenCalledTimes(1);
    });
  });

  it('says a collection is empty, and offers the first page when a later one is', async () => {
    useProfileDirectory.mockReturnValue(loaded([]));
    await onTheDirectoryAt('/profiles/?collection=organizations', async (page) => {
      expect(within(page).getByRole('heading', { level: 2 }).textContent).toBe('No Organizations yet');
      expect(linkPaths(page)).toEqual([]);
    });

    await onTheDirectoryAt('/profiles/?after=zz', async (page) => {
      expect(within(page).getByRole('heading', { level: 2 }).textContent).toBe('No more people');
      expect(linkPaths(page)).toEqual(['/profiles/']);
    });
  });
});
