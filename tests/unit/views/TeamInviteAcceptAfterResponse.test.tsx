import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-errors';
import TeamInviteAccept from '@/views/TeamInviteAccept';

import { click, createFakeContainer, findByText, installFakeDomGlobals } from '../../fixtures/fakeDom';

// The invite page after the invitee answers. The decline revokes the invite, so reading the
// preview again answers 404; neither that nor a failed read after Accept may replace the
// confirmation. Drives the real page, hook and React Query client; only the API, auth and
// the context list are faked.

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<{ ok: boolean }>;
  user: { id: string; email: string } | null;
};

const auth = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const initial = (): AuthState => ({
    isAuthenticated: true,
    isLoading: false,
    logout: async () => ({ ok: true }),
    user: { id: 'user-1', email: 'invitee@example.com' },
  });
  let state = initial();
  return {
    get: () => state,
    set: (next: Partial<AuthState>) => {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener());
    },
    reset: () => {
      state = initial();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
const workspaceMocks = vi.hoisted(() => ({
  refreshTeams: vi.fn(async () => []),
  rememberTeam: vi.fn(),
  selectWorkspace: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  getTeamInvitePreview: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => useSyncExternalStore(auth.subscribe, auth.get, auth.get) };
});
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspaceMocks }));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const preview = {
  status: 'pending' as const,
  teamId: 'team-1',
  teamName: 'Acme Corp',
  teamSlug: 'acme-corp',
  role: 'editor' as const,
  expiresAt: '2026-10-05T00:00:00.000Z',
  inviterName: 'Owner User',
  inviterEmail: 'owner@example.com',
};

const inviteRevoked = () =>
  new ApiError({ status: 404, message: 'Invite not found', code: 'invite_not_found' });

const NO_LONGER_AVAILABLE = 'This invite is no longer available';

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;

// Lets pending requests answer and React apply what they changed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// The tab loses focus and gets it back, as when the invitee switches tabs and returns.
const refocusTab = async () => {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await settle();
};

const deferred = <T,>() => {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((_resolve, fail) => {
    reject = fail;
  });
  return { promise, reject };
};

async function openInvite() {
  // The app's defaults (src/App.tsx); the page's query sets its own retry and staleTime.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } } });
  const router = createMemoryRouter(
    [
      { path: '/team-invites/:token', element: <TeamInviteAccept /> },
      { path: '*', element: null },
    ],
    { initialEntries: ['/team-invites/invite-token'] },
  );
  const container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  await settle();

  const press = async (label: string) => {
    await act(async () => {
      click(container, findByText(container, 'BUTTON', label));
    });
    await settle();
  };
  return { text: () => container.textContent, press };
}

describe('Organization invite page after the invitee answers', () => {
  beforeEach(() => {
    auth.reset();
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getTeamInvitePreview.mockResolvedValueOnce(preview);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    focusManager.setFocused(undefined);
  });

  it('keeps "Invite declined" when the tab regains focus after a decline', async () => {
    const page = await openInvite();
    expect(page.text()).toContain('Accept invite');

    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    apiMocks.getTeamInvitePreview.mockRejectedValue(inviteRevoked());
    await page.press('Decline');
    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');

    await refocusTab();

    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');
    expect(page.text()).not.toContain(NO_LONGER_AVAILABLE);
    expect(apiMocks.getTeamInvitePreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the Switch to panel when a read after Accept fails', async () => {
    const page = await openInvite();

    apiMocks.acceptTeamInvite.mockResolvedValue({ memberId: 'member-1', role: 'editor', teamId: 'team-1' });
    apiMocks.getTeamInvitePreview.mockRejectedValue(new Error('Network request failed'));
    await page.press('Accept invite');
    expect(page.text()).toContain('Invite accepted.');

    await refocusTab();

    expect(page.text()).toContain('Invite accepted.');
    expect(page.text()).toContain('Switch to Acme Corp');
    expect(page.text()).not.toContain('Network request failed');
  });

  it('keeps "Invite declined" when a read that started before the decline fails after it', async () => {
    const page = await openInvite();
    const lateRead = deferred<typeof preview>();
    apiMocks.getTeamInvitePreview.mockReturnValueOnce(lateRead.promise);
    await refocusTab();
    expect(apiMocks.getTeamInvitePreview).toHaveBeenCalledTimes(2);

    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    await page.press('Decline');
    await act(async () => lateRead.reject(inviteRevoked()));
    await settle();

    expect(page.text()).toContain('Invite declined. You did not join Acme Corp.');
    expect(page.text()).not.toContain(NO_LONGER_AVAILABLE);
  });

  it('still notices on focus that an unanswered invite was revoked', async () => {
    const page = await openInvite();

    apiMocks.getTeamInvitePreview.mockRejectedValue(inviteRevoked());
    await refocusTab();

    expect(page.text()).toContain(NO_LONGER_AVAILABLE);
  });

  it('loads the invite for another account that signs in after a decline', async () => {
    const page = await openInvite();
    apiMocks.declineTeamInvite.mockResolvedValue({ success: true });
    await page.press('Decline');
    expect(page.text()).toContain('Invite declined.');

    apiMocks.getTeamInvitePreview.mockResolvedValue({ ...preview, teamName: 'Beta Org' });
    await act(async () => auth.set({ user: { id: 'user-2', email: 'other@example.com' } }));
    await settle();

    expect(page.text()).toContain('Beta Org');
    expect(page.text()).toContain('Accept invite');
    expect(page.text()).not.toContain('Invite declined.');
  });
});
