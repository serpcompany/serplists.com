import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun, TemplatesContextProps } from '@/types/checklist';

// Pages key effects on the context's actions: the run page reloads its run when updateRun
// changes. The actions must keep their identity when the cached lists change (a share marks
// the run public in them) or the active context switches, or an open run reloads and loses
// its unsaved task notes.

const workspace = vi.hoisted(() => ({ activeTeamId: undefined as string | undefined, scope: 'personal' }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: workspace.activeTeamId,
    isWorkspaceLoading: false,
    workspaceScopeId: workspace.scope,
    workspaceStatus: 'ready',
  }),
}));

import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';
import { markRunShared, queryKeys } from '@/lib/queryCache';

// Vitest runs in node with no DOM. The probe renders nothing, so React DOM needs only a
// container object, and a window while it commits, to run effects.
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

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  workspace.activeTeamId = undefined;
  workspace.scope = 'personal';
});

const privateRun: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch checklist',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-1', title: 'Checklist', items: [{ id: 'item-1', title: 'First task' }] }],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
  revision: 1,
  isPublic: false,
};

const actionsOf = (context: TemplatesContextProps) => ({
  updateRun: context.updateRun,
  deleteRun: context.deleteRun,
  revalidateRun: context.revalidateRun,
  markRunShared: context.markRunShared,
  deleteTemplate: context.deleteTemplate,
  importTemplates: context.importTemplates,
  createRun: context.createRun,
  createTemplate: context.createTemplate,
  updateTemplate: context.updateTemplate,
});

function mountProvider(queryClient: QueryClient) {
  let context: TemplatesContextProps | undefined;
  const Probe = () => {
    context = useTemplates();
    return null;
  };
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>
  );
  root = createRoot(fakeContainer as unknown as Element);
  act(() => root?.render(tree()));
  return {
    context: () => {
      if (!context) throw new Error('TemplatesProvider did not render');
      return context;
    },
    rerender: () => act(() => root?.render(tree())),
  };
}

describe('TemplatesProvider actions', () => {
  it('keep their identity when a share marks the run public in the cached runs list', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const { context } = mountProvider(queryClient);
    const before = actionsOf(context());
    const runsBefore = context().runs;
    expect(runsBefore).toEqual([privateRun]);

    await act(async () => {
      await markRunShared(queryClient, 'run-1');
      // Query updates reach observers on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(context().runs).not.toBe(runsBefore);
    expect(context().runs[0].isPublic).toBe(true);
    for (const [name, action] of Object.entries(actionsOf(context()))) {
      expect(action, name).toBe(before[name as keyof typeof before]);
    }
  });

  it('keep their identity when the active context switches', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const { context, rerender } = mountProvider(queryClient);
    const before = actionsOf(context());
    const templatesBefore = context().allTemplates;

    workspace.activeTeamId = 'team-1';
    workspace.scope = 'team-1';
    rerender();

    expect(context().allTemplates).not.toBe(templatesBefore);
    for (const [name, action] of Object.entries(actionsOf(context()))) {
      expect(action, name).toBe(before[name as keyof typeof before]);
    }
  });
});

describe('TemplatesProvider markRunShared (the runs list Share)', () => {
  it("marks the run shared and refreshes that run's Changelog, which the share wrote to", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const history = [...queryKeys.runHistory('run-1'), { limit: 8 }];
    const otherHistory = [...queryKeys.runHistory('run-2'), { limit: 8 }];
    queryClient.setQueryData(history, { events: [] });
    queryClient.setQueryData(otherHistory, { events: [] });
    const { context } = mountProvider(queryClient);

    await act(async () => {
      context().markRunShared?.('run-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(context().runs[0].isPublic).toBe(true);
    // Otherwise the run page, reopened within 60s, shows the Changelog without "Created share link".
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherHistory)?.isInvalidated).toBe(false);
  });
});
