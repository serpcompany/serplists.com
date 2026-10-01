import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Link } from '@/components/navigation/Link';
import type { TemplateEditorSaveResult } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import TemplateEditor from '@/views/TemplateEditor';

import { click, createFakeContainer, findByText, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { deferred } from '../../support/deferred';
import { navigation, RoutedPages } from '../../support/nextNavigation';

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
  restoreGlobals = installFakeDomGlobals(navigation.window);
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

const created = (): TemplateEditorSaveResult => ({
  success: true,
  errors: [],
  savedValues: buildTemplateEditorFormValues({ title: 'Onboarding' }),
});

const SidebarMountedAcrossPages = () => (
  <nav>
    <Link href="/dashboard/templates/new/">New Template</Link>
    <Link href="/dashboard/runs/">Runs</Link>
  </nav>
);

async function renderNewTemplateEditor() {
  navigation.reset('/dashboard/templates/new/', {
    routes: ['/dashboard/templates/new', '/dashboard/templates', '/dashboard/runs'],
  });
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    root?.render(
      <>
        <SidebarMountedAcrossPages />
        <RoutedPages pages={{ '/dashboard/templates/new': <TemplateEditor /> }} />
      </>,
    );
  });
  return { container };
}

describe('TemplateEditor create after a same-path navigation', () => {
  it('still goes to My Templates when New Template is clicked while the create saves', async () => {
    const request = deferred<TemplateEditorSaveResult>();
    mocks.save.mockReturnValueOnce(request.promise);
    const { container } = await renderNewTemplateEditor();

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Save'));
    });
    await act(async () => {
      click(container, findByText(container, 'A', 'New Template'));
    });
    expect(navigation.pathname()).toBe('/dashboard/templates/new/');
    expect(navigation.log.at(-1)).toMatchObject({ href: '/dashboard/templates/new/', via: 'link' });
    expect(navigation.window.confirm).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve(created());
    });

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.settleDraft).toHaveBeenCalledTimes(1);
    expect(navigation.pathname()).toBe('/dashboard/templates/');
  });

  it('settles the draft but does not pull the user back when they went to another page while it saved', async () => {
    const request = deferred<TemplateEditorSaveResult>();
    mocks.save.mockReturnValueOnce(request.promise);
    const { container } = await renderNewTemplateEditor();

    await act(async () => {
      click(container, findByText(container, 'BUTTON', 'Save'));
    });
    await act(async () => {
      click(container, findByText(container, 'A', 'Runs'));
    });
    expect(navigation.pathname()).toBe('/dashboard/runs/');
    await act(async () => {
      request.resolve(created());
    });

    expect(mocks.settleDraft).toHaveBeenCalledTimes(1);
    expect(navigation.pathname()).toBe('/dashboard/runs/');
  });
});
