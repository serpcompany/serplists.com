import { navigation } from '../../support/mockedNextNavigation';
import { baseRun, openTheRunPageInTheDom } from '../../support/checklistRunPage';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import { pressTheButton } from '../../support/pressTheButton';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

vi.mock('@/hooks/usePageVisit', async () => (await import('../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);

theInMemoryBrowserAsTheWindow();

const SHARED_RUN = '/share/abc123/';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => cleanup());

const withoutARun = { counts: countRunExecutionItems(null), run: null };

describe('Run page while the run loads', () => {
  it('shows the loading state in the narrow shared page on a shared link', async () => {
    const { container } = await openTheRunPageInTheDom({ ...withoutARun, isSharedRun: true, loading: true }, SHARED_RUN);

    expect(container.querySelector('[data-dashboard-loading-state="true"]')).not.toBeNull();
    expect(container.querySelector('[data-dashboard-content-shell="true"]')).toBeNull();
  });
});

describe('Run page without a run', () => {
  it('says why the private run did not load, and goes back to My Runs', async () => {
    const { container } = await openTheRunPageInTheDom({ ...withoutARun, loadError: 'Unable to reach the server' });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Unable to load run');
    expect(toast.error).toHaveBeenCalledWith('Unable to reach the server');
    expect(container.querySelector('[data-dashboard-content-shell="true"]')).not.toBeNull();

    await pressTheButton('Back');
    expect(navigation.url()).toBe('/dashboard/runs/');
  });

  it('sends a shared link that failed back to the Template Library', async () => {
    await openTheRunPageInTheDom({ ...withoutARun, isSharedRun: true }, SHARED_RUN);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Run not found');

    await pressTheButton('Back');
    expect(navigation.url()).toBe('/templates/');
  });

  it.each([
    ['a private run, to the console home', '/dashboard/runs/run-1/', false, '/dashboard/templates/'],
    ['a shared run, to the Template Library', SHARED_RUN, true, '/templates/'],
  ])('says a run that is gone is not found and leaves %s', async (_case, at, isSharedRun, destination) => {
    await openTheRunPageInTheDom({ ...withoutARun, isSharedRun, notFound: true }, at);

    expect(toast.error).toHaveBeenCalledWith('Run not found');
    expect(navigation.url()).toBe(destination);
  });
});

describe('Shared run Copy Link', () => {
  const openTheSharedRun = () =>
    openTheRunPageInTheDom(
      { counts: countRunExecutionItems(baseRun), isSharedRun: true, run: baseRun, selectedItemId: 'item-1' },
      SHARED_RUN,
    );

  it('copies the address of the shared run', async () => {
    writeText.mockResolvedValue(undefined);
    await openTheSharedRun();

    await pressTheButton('Copy Link');

    expect(writeText).toHaveBeenCalledWith(`${navigation.window.location.origin}${SHARED_RUN}`);
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard');
  });

  it('says to copy it from the address bar when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    await openTheSharedRun();

    await pressTheButton('Copy Link');

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy the link. Copy it from the address bar.");
  });
});

describe('Sharing a private Run', () => {
  it('creates the share link and copies it', async () => {
    writeText.mockResolvedValue(undefined);
    const createShare = vi.fn(async () => ({ kind: 'ok' as const, shareUrl: 'https://serplists.com/share/abc123/' }));
    await openTheRunPageInTheDom({ counts: countRunExecutionItems(baseRun), createShare, run: baseRun, selectedItemId: 'item-1' });

    await pressTheButton('Share');

    expect(createShare).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://serplists.com/share/abc123/');
    expect(toast.success).toHaveBeenCalledWith('Share link copied to clipboard');
  });
});
