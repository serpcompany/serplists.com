import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real template detail model (its template query and its effects) through the
// re-renders the app causes. Only the API is faked.

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

// Vitest runs in node with no DOM. The probe renders nothing, so React DOM needs only a
// container object, and a window while it commits (it reads the focused element), to run
// effects and query subscriptions.
const fakeDocument = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
const fakeContainer = {
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  ownerDocument: fakeDocument,
  addEventListener() {},
  removeEventListener() {},
};
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = { HTMLIFrameElement: class {}, document: fakeDocument, addEventListener() {}, removeEventListener() {} };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

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

// New callbacks on every call, as TemplatesProvider hands out when it re-renders.
const privateOptions = (): UseTemplateDetailModelOptions => ({
  canEditTemplates: true,
  createRun: vi.fn(),
  createTemplate: vi.fn(),
  identifier: 'template-1',
  isAuthenticated: true,
  mode: 'private',
  teamId: undefined,
  userId: 'user-1',
  username: 'alice',
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
});

let root: Root | undefined;
let queryClient: QueryClient;
// Every model the page rendered with, in order.
let renders: Model[];

const latest = () => renders[renders.length - 1];

const Probe = ({ options }: { options: UseTemplateDetailModelOptions }) => {
  renders.push(useTemplateDetailModel(options));
  return null;
};

const render = async (options: UseTemplateDetailModelOptions) => {
  root ??= createRoot(fakeContainer as never);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Probe options={options} />
      </QueryClientProvider>,
    );
  });
};

// Lets pending requests answer and React apply what they changed.
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Whether the page swapped to its full-page spinner at any render from `from` on.
const showedSpinnerSince = (from: number) => renders.slice(from).some((model) => model.loading);

// A request that answers only when the test says so, so the page renders while it runs.
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60 * 1000 } } });
  renders = [];
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
});

// H36: the page reloaded its template, and showed its spinner (unmounting the Start Run
// dialog), whenever an unrelated re-render handed it new callbacks or list identities.
describe('template detail page across re-renders', () => {
  it('loads a private template once while the page re-renders with new callbacks', async () => {
    apiMock.getTemplateById.mockResolvedValue(serverRow());
    await render(privateOptions());
    await settle();
    expect(latest().template?.version).toBe(3);
    const loadedAt = renders.length;

    for (let count = 0; count < 5; count += 1) {
      await render(privateOptions());
      await settle();
    }

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(1);
    expect(apiMock.getTemplates).not.toHaveBeenCalled();
    expect(renders.length).toBeGreaterThan(loadedAt);
    expect(showedSpinnerSince(loadedAt)).toBe(false);
  });

  it('keeps the template on screen while a template change elsewhere refreshes it', async () => {
    const refresh = deferred<ReturnType<typeof serverRow>>();
    apiMock.getTemplateById.mockResolvedValueOnce(serverRow()).mockReturnValueOnce(refresh.promise);
    await render(privateOptions());
    await settle();
    const loadedAt = renders.length;

    // A save, copy or archive anywhere in the app invalidates ['templates'].
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    });
    await render(privateOptions());

    expect(renders.length).toBeGreaterThan(loadedAt);
    expect(latest()).toMatchObject({ loading: false, template: { version: 3 } });

    await act(async () => refresh.resolve(serverRow({ version: 4 })));
    await settle();

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(latest().template?.version).toBe(4);
    expect(showedSpinnerSince(loadedAt)).toBe(false);
  });

  it("loads a public template once while the viewer's session resolves", async () => {
    apiMock.getTemplateBySlug.mockResolvedValue(serverRow({ is_public: true }));

    await render(publicOptions(undefined));
    await render(publicOptions('user-1'));
    await settle();
    const loadedAt = renders.length;
    for (let count = 0; count < 3; count += 1) {
      await render(publicOptions('user-1'));
      await settle();
    }

    expect(apiMock.getTemplateBySlug).toHaveBeenCalledTimes(1);
    expect(latest().template?.id).toBe('template-1');
    expect(showedSpinnerSince(loadedAt)).toBe(false);
  });

  it('loads again, with the loading state, for a different template', async () => {
    apiMock.getTemplateById.mockImplementation(async (id: string) => serverRow({ id }));
    await render(privateOptions());
    await settle();
    const loadedAt = renders.length;

    await render({ ...privateOptions(), identifier: 'template-2' });
    expect(latest().loading).toBe(true);
    await settle();

    expect(apiMock.getTemplateById).toHaveBeenCalledTimes(2);
    expect(latest().template?.id).toBe('template-2');
    expect(showedSpinnerSince(loadedAt)).toBe(true);
  });
});
