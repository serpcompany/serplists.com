import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TemplateEditorSaveResult } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import TemplateEditor from '@/views/TemplateEditor';

import { click, createFakeContainer, findByText, installFakeDomGlobals } from '../../fixtures/fakeDom';

// A create leaves the editor for My Templates when it finishes. The sidebar's New Template
// link sits outside the locked editor, and clicking it on the new-template page is a
// same-path navigation: the editor stays mounted, and the location gets a new key. Drives
// the real page, page visit and leave guard under a memory data router; only the model,
// the access hook, the contexts and the heavy editor panels are faked.

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  settleDraft: vi.fn(),
}));

vi.mock('@/features/template-editor/useTemplateEditorModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/template-editor/useTemplateEditorModel')>();
  const { buildTemplateEditorFormValues: build } = await import('@/lib/forms/templateEditorForm');
  const initialValues = build({ title: '' });
  return {
    ...actual,
    useTemplateEditorModel: () => ({
      initialValues,
      isSaving: false,
      loading: false,
      loadError: null,
      ownership: undefined,
      ownerSlug: undefined,
      getVersion: () => undefined,
      setVersion: vi.fn(),
      reload: vi.fn(),
      save: mocks.save,
      templateSlug: undefined,
    }),
  };
});
vi.mock('@/features/template-editor/useTemplateEditPermission', () => ({
  useTemplateEditPermission: () => 'editable',
}));
vi.mock('@/features/template-editor/useTemplateEditorAccess', () => ({
  useTemplateEditorAccess: () => ({
    draft: null,
    discardDraft: vi.fn(),
    handleSaveResult: () => false,
    isStartingCheckout: false,
    keepDraft: () => false,
    notice: null,
    restoreDraft: vi.fn(),
    settleDraft: mocks.settleDraft,
    signIn: vi.fn(),
    startUpgrade: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTemplateEditorState', () => ({
  useTemplateEditorState: () => ({
    selectedSectionIndex: 0,
    selectedItemIndex: null,
    showingSEO: false,
    showingTemplateInfo: true,
    errors: [],
    setErrors: vi.fn(),
    handleSelectSection: vi.fn(),
    handleSelectItem: vi.fn(),
    handleSelectSEO: vi.fn(),
    handleSelectTemplateInfo: vi.fn(),
  }),
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', username: 'jane' } }),
}));
vi.mock('@/components/template-editor/TemplateHeader', () => ({
  TemplateHeader: ({ onSave }: { onSave: () => void }) => (
    <button type="button" onClick={onSave}>
      Save
    </button>
  ),
}));
vi.mock('@/components/template-editor/OutlineSidebar', () => ({ OutlineSidebar: () => null }));
vi.mock('@/components/template-editor/EditorPanels', () => ({ EditorPanels: () => null }));
vi.mock('@/components/template-editor/GenerateFromClipy', () => ({ GenerateFromClipy: () => null }));
vi.mock('@/components/template-editor/TemplateEditorAccessNotices', () => ({
  TemplateEditorAccessNotices: () => null,
}));
vi.mock('@/components/ui/dialog', () => {
  const Nothing = () => null;
  return {
    Dialog: Nothing,
    DialogContent: Nothing,
    DialogDescription: Nothing,
    DialogHeader: Nothing,
    DialogTitle: Nothing,
  };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
beforeEach(() => {
  vi.clearAllMocks();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const created = (): TemplateEditorSaveResult => ({
  success: true,
  errors: [],
  savedValues: buildTemplateEditorFormValues({ title: 'Onboarding' }),
});

async function renderNewTemplateEditor() {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/templates/new', element: <TemplateEditor /> },
      { path: '/dashboard/templates', element: null },
      { path: '/dashboard/runs', element: null },
    ],
    { initialEntries: ['/dashboard/templates/new'] },
  );
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    // As in the app, which does not opt in to v7_startTransition.
    root?.render(<RouterProvider future={{ v7_startTransition: false }} router={router} />);
  });
  return { container, router };
}

describe('TemplateEditor create after a same-path navigation', () => {
  it('still goes to My Templates when New Template is clicked while the create saves', async () => {
    const request = deferred<TemplateEditorSaveResult>();
    mocks.save.mockReturnValueOnce(request.promise);
    const { container, router } = await renderNewTemplateEditor();

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Save'));
    });
    const firstKey = router.state.location.key;
    // The sidebar's New Template link: the same path with a new location key.
    await act(async () => {
      await router.navigate('/dashboard/templates/new');
    });
    expect(router.state.location.pathname).toBe('/dashboard/templates/new');
    expect(router.state.location.key).not.toBe(firstKey);

    await act(async () => {
      request.resolve(created());
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.settleDraft).toHaveBeenCalledTimes(1);
    // The saved template does not stay in the editor as unsaved work.
    expect(router.state.location.pathname).toBe('/dashboard/templates');
  });

  it('does not pull the user back when they went to another page while it saved', async () => {
    const request = deferred<TemplateEditorSaveResult>();
    mocks.save.mockReturnValueOnce(request.promise);
    const { container, router } = await renderNewTemplateEditor();

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Save'));
    });
    await act(async () => {
      await router.navigate('/dashboard/runs');
    });
    await act(async () => {
      request.resolve(created());
    });

    // The draft is still settled, but the user stays where they went.
    expect(mocks.settleDraft).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/dashboard/runs');
  });
});
