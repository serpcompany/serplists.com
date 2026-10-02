import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastOf } from '../../../support/elements';

import { createApiError } from '@/lib/api-errors';

import { createFakeContainer, installFakeDomGlobals } from '../../../fixtures/fakeDom';
import { createQueryClientWithAppDefaults } from '../../../support/appQueryClient';
import { deferred } from '../../../support/deferred';

const apiMock = vi.hoisted(() => ({
  getBillingStatus: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  getTemplateHistory: vi.fn(),
  getTemplates: vi.fn(),
  updateTemplate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMock }));

import {
  useTemplateDetailModel,
  type UseTemplateDetailModelOptions,
} from '@/features/template-detail/useTemplateDetailModel';

type Model = ReturnType<typeof useTemplateDetailModel>;

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'template-1',
  title: 'Launch Checklist',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Confirm owner' }] }],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-09-01T00:00:00.000Z',
  is_public: false,
  slug: 'launch-checklist',
  version: 3,
  ...overrides,
});

const privateOptionsWithNewCallbacks = (): UseTemplateDetailModelOptions => ({
  canEditTemplates: true,
  createRun: vi.fn(),
  createTemplate: vi.fn(),
  identifier: 'template-1',
  isAuthenticated: true,
  mode: 'private',
  teamId: undefined,
  userId: 'user-1',
  username: 'alice',
  workspaceStatus: 'ready',
});

const publicOptions = (userId: string | undefined): UseTemplateDetailModelOptions => ({
  createRun: vi.fn(),
  createTemplate: vi.fn(),
  identifier: 'launch-checklist',
  isAuthenticated: Boolean(userId),
  mode: 'public',
  ownerUsername: 'alice',
  teamId: undefined,
  userId,
  username: undefined,
  workspaceStatus: 'ready',
});

let root: Root | undefined;
let queryClient: QueryClient;
let renderedModels: Model[];

const latest = () => lastOf(renderedModels);

const Probe = ({ options }: { options: UseTemplateDetailModelOptions }) => {
  renderedModels.push(useTemplateDetailModel(options));
  return null;
};

const render = async (options: UseTemplateDetailModelOptions) => {
  root ??= createRoot(createFakeContainer() as never);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Probe options={options} />
      </QueryClientProvider>,
    );
  });
};

const letPendingRequestsAnswer = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const showedTheFullPageSpinnerSince = (renderIndex: number) =>
  renderedModels.slice(renderIndex).some((model) => model.loading);

const deliverPendingQueryNotifications = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  queryClient = createQueryClientWithAppDefaults();
  renderedModels = [];
  Object.values(apiMock).forEach((mock) => mock.mockReset());
  apiMock.getBillingStatus.mockResolvedValue({ billingEnabled: false, plan: 'free' });
  apiMock.getTemplateHistory.mockResolvedValue({ templateId: 'template-1', events: [], versions: [] });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
  queryClient.clear();
  await deliverPendingQueryNotifications();
});

describe('template detail page across re-renders, which must not reload it or swap in the spinner that unmounts the Start Run dialog', () => {
  it('loads a private template once while the page re-renders with new callbacks', async () => {
    apiMock.getTemplateById.mockResolvedValue(serverRow());
    await render(privateOptionsWithNewCallbacks());
    await letPendingRequestsAnswer();
    expect(latest().template?.version).toBe(3);
    const loadedAt = renderedModels.length;

    for (let count = 0; count < 5; count += 1) {
      await render(privateOptionsWithNewCallbacks());
      await letPendingRequestsAnswer();
    }

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(1);
    expect(apiMock.getTemplates).not.toHaveBeenCalled();
    expect(renderedModels.length).toBeGreaterThan(loadedAt);
    expect(showedTheFullPageSpinnerSince(loadedAt)).toBe(false);
  });

  it('keeps the template on screen while a save, copy or archive anywhere in the app refreshes it', async () => {
    const refresh = deferred<ReturnType<typeof serverRow>>();
    apiMock.getTemplateById.mockResolvedValueOnce(serverRow()).mockReturnValueOnce(refresh.promise);
    await render(privateOptionsWithNewCallbacks());
    await letPendingRequestsAnswer();
    const loadedAt = renderedModels.length;

    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    });
    await render(privateOptionsWithNewCallbacks());

    expect(renderedModels.length).toBeGreaterThan(loadedAt);
    expect(latest()).toMatchObject({ loading: false, template: { version: 3 } });

    await act(async () => refresh.resolve(serverRow({ version: 4 })));
    await letPendingRequestsAnswer();

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(latest().template?.version).toBe(4);
    expect(showedTheFullPageSpinnerSince(loadedAt)).toBe(false);
  });

  it("loads a public template once while the viewer's session resolves", async () => {
    apiMock.getTemplateBySlug.mockResolvedValue(serverRow({ is_public: true }));

    await render(publicOptions(undefined));
    await render(publicOptions('user-1'));
    await letPendingRequestsAnswer();
    const loadedAt = renderedModels.length;
    for (let count = 0; count < 3; count += 1) {
      await render(publicOptions('user-1'));
      await letPendingRequestsAnswer();
    }

    expect(apiMock.getTemplateBySlug).toHaveBeenCalledTimes(1);
    expect(latest().template?.id).toBe('template-1');
    expect(showedTheFullPageSpinnerSince(loadedAt)).toBe(false);
  });

  it('loads again, with the loading state, for a different template', async () => {
    apiMock.getTemplateById.mockImplementation(async (id: string) => serverRow({ id }));
    await render(privateOptionsWithNewCallbacks());
    await letPendingRequestsAnswer();
    const loadedAt = renderedModels.length;

    await render({ ...privateOptionsWithNewCallbacks(), identifier: 'template-2' });
    expect(latest().loading).toBe(true);
    await letPendingRequestsAnswer();

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(latest().template?.id).toBe('template-2');
    expect(showedTheFullPageSpinnerSince(loadedAt)).toBe(true);
  });
});

describe('template detail visibility switch after an edit conflict, whose stale copy would fail every retry the same way', () => {
  let serverCopy: ReturnType<typeof serverRow>;

  beforeEach(() => {
    serverCopy = serverRow({ version: 3 });
    apiMock.getTemplateById.mockImplementation(async () => ({ ...serverCopy }));
    apiMock.updateTemplate.mockImplementation(
      async (_id: string, body: { expected_version: number; is_public: boolean }) => {
        if (body.expected_version !== serverCopy.version) {
          throw createApiError(409, { code: 'edit_conflict', error: 'Template changed since it was loaded' });
        }
        serverCopy = { ...serverCopy, is_public: body.is_public };
        return { success: true, id: serverCopy.id, version: serverCopy.version, slug: serverCopy.slug };
      },
    );
  });

  it('reloads the template another member saved in place, showing the old copy without a spinner meanwhile, so the retry succeeds', async () => {
    await render(privateOptionsWithNewCallbacks());
    await letPendingRequestsAnswer();
    serverCopy = { ...serverCopy, title: 'Launch Checklist v4', version: 4 };
    const loadedAt = renderedModels.length;
    const reload = deferred<ReturnType<typeof serverRow>>();
    apiMock.getTemplateById.mockReturnValueOnce(reload.promise);

    let conflict: Promise<unknown> | undefined;
    await act(async () => {
      conflict = latest().setVisibility(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(latest()).toMatchObject({ loading: false, template: { version: 3 } });

    await act(async () => reload.resolve({ ...serverCopy }));
    await expect(conflict).resolves.toEqual({
      kind: 'error',
      message: 'This template changed elsewhere. It was reloaded; try again.',
    });
    await letPendingRequestsAnswer();

    expect(latest().template).toMatchObject({ title: 'Launch Checklist v4', version: 4, isPublic: false });
    expect(showedTheFullPageSpinnerSince(loadedAt)).toBe(false);

    await act(async () => {
      await expect(latest().setVisibility(true)).resolves.toEqual({ kind: 'ok' });
    });
    expect(apiMock.updateTemplate.mock.calls.map(([, body]): unknown => body)).toEqual([
      { expected_version: 3, is_public: true },
      { expected_version: 4, is_public: true },
    ]);
    expect(apiMock.getTemplates).not.toHaveBeenCalled();
  });
});
