import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import { shownConsole } from '../../support/mockedConsoleContext';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Link } from '@/components/navigation/Link';
import type { TemplateEditorSaveResult } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import TemplateEditor from '@/views/TemplateEditor';

import { deferred } from '../../support/deferred';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

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
vi.mock('@/features/template-editor/useTemplateEditorAccess', async () => {
  const { editorAccess } = await import('../../fixtures/templateEditorHooks');
  return { useTemplateEditorAccess: () => editorAccess({ keepDraft: () => false, settleDraft: mocks.settleDraft }) };
});
vi.mock('@/hooks/useTemplateEditorState', async () => ({
  useTemplateEditorState: (await import('../../fixtures/templateEditorHooks')).editorState,
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', username: 'jane' } }),
}));
vi.mock('@/components/template-editor/TemplateHeader', () => ({
  TemplateHeader: ({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) => (
    <>
      <button type="button" onClick={onSave}>
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </>
  ),
}));
vi.mock('@/components/template-editor/OutlineSidebar', () => ({ OutlineSidebar: () => null }));
vi.mock('@/components/template-editor/EditorPanels', () => ({ EditorPanels: () => null }));
vi.mock('@/components/template-editor/GenerateFromClipy', () => ({ GenerateFromClipy: () => null }));
vi.mock('@/components/template-editor/TemplateEditorAccessNotices', () => ({
  TemplateEditorAccessNotices: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

beforeEach(() => {
  vi.clearAllMocks();
  shownConsole.context = PERSONAL_CONSOLE;
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
  return renderSettled(
    <>
      <SidebarMountedAcrossPages />
      <RoutedPages pages={{ '/dashboard/templates/new': <TemplateEditor /> }} />
    </>,
  );
}

async function startSavingTheNewTemplate() {
  const request = deferred<TemplateEditorSaveResult>();
  mocks.save.mockReturnValueOnce(request.promise);
  await renderNewTemplateEditor();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
  return { request };
}

describe('TemplateEditor create after a same-path navigation', () => {
  it('still goes to My Templates when New Template is clicked while the create saves', async () => {
    const { request } = await startSavingTheNewTemplate();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'New Template' }));
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
    const { request } = await startSavingTheNewTemplate();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Runs' }));
    });
    expect(navigation.pathname()).toBe('/dashboard/runs/');
    await act(async () => {
      request.resolve(created());
    });

    expect(mocks.settleDraft).toHaveBeenCalledTimes(1);
    expect(navigation.pathname()).toBe('/dashboard/runs/');
  });
});

describe('TemplateEditor navigation in the context it shows', () => {
  const acmeNewTemplatePath = '/dashboard/organization/team-1/templates/new/';

  async function openTheNewTemplateEditorIn(path: string) {
    navigation.reset(path, {
      routes: ['/dashboard/organization/[organizationId]/templates/new', '/dashboard/templates/new'],
    });
    await renderSettled(
      <RoutedPages
        pages={{
          '/dashboard/organization/[organizationId]/templates/new': <TemplateEditor />,
          '/dashboard/templates/new': <TemplateEditor />,
        }}
      />,
    );
  }

  const click = (name: string) =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });

  it("goes to the Organization's Templates after creating a Template there", async () => {
    shownConsole.context = organizationConsole('team-1');
    mocks.save.mockResolvedValueOnce(created());
    await openTheNewTemplateEditorIn(acmeNewTemplatePath);

    await click('Save');

    expect(navigation.pathname()).toBe('/dashboard/organization/team-1/templates/');
  });

  it("goes back to the Organization's Templates on Cancel", async () => {
    shownConsole.context = organizationConsole('team-1');
    await openTheNewTemplateEditorIn(acmeNewTemplatePath);

    await click('Cancel');

    expect(navigation.pathname()).toBe('/dashboard/organization/team-1/templates/');
  });

  it('goes back to the Personal Templates on Cancel in Personal', async () => {
    await openTheNewTemplateEditorIn('/dashboard/templates/new/');

    await click('Cancel');

    expect(navigation.pathname()).toBe('/dashboard/templates/');
  });
});
