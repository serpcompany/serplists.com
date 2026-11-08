import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import React, { act, useContext } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useFormContext } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { TemplateEditorUploadsContext } from '@/features/template-editor/pendingUploads';
import type { TemplateEditorSaveResult } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import TemplateEditor from '@/views/TemplateEditor';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

const editor = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  loadError: null as string | null,
  save: vi.fn<(values: unknown) => Promise<unknown>>(),
  setVersion: vi.fn<(version: number) => void>(),
  generatedDraft: null as unknown,
}));

vi.mock('@/features/template-editor/useTemplateEditorModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/template-editor/useTemplateEditorModel')>();
  const { buildTemplateEditorFormValues: build } = await import('@/lib/forms/templateEditorForm');
  const loaded = build({ title: 'Launch checklist' });
  return {
    ...actual,
    useTemplateEditorModel: () => ({
      getVersion: () => 3,
      initialValues: loaded,
      isSaving: false,
      loadError: editor.loadError,
      loading: false,
      ownerSlug: 'jane',
      ownership: undefined,
      reload: vi.fn(),
      save: editor.save,
      setVersion: editor.setVersion,
      templateSlug: 'launch-checklist',
    }),
  };
});
vi.mock('@/features/template-editor/useTemplateEditPermission', () => ({ useTemplateEditPermission: () => 'editable' }));
vi.mock('@/features/template-editor/useTemplateEditorAccess', async () => {
  const fixtures = await import('../../fixtures/templateEditorHooks');
  return { useTemplateEditorAccess: () => fixtures.editorAccess(editor.access) };
});
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', username: 'jane' } }) }));
vi.mock('@/components/template-editor/EditorPanels', () => ({
  EditorPanels: function TitleFieldAndAnUploadThatStartsAsSaveIsPressed() {
    const form = useFormContext<TemplateEditorFormValues>();
    const uploads = useContext(TemplateEditorUploadsContext);
    return (
      <>
        <label htmlFor="title-field">Title</label>
        <input id="title-field" {...form.register('title')} />
        <button
          type="button"
          onClick={() => {
            uploads?.track(new Promise(() => undefined));
            screen.getByRole('button', { name: 'Save' }).click();
          }}
        >
          Attach a file and save at once
        </button>
      </>
    );
  },
}));
vi.mock('@/components/template-editor/GenerateFromClipy', () => ({
  GenerateFromClipy: ({ confirmReplace, onGenerated }: { confirmReplace: () => boolean; onGenerated: (values: unknown) => void }) => (
    <button type="button" onClick={() => confirmReplace() && onGenerated(editor.generatedDraft)}>
      Generate from Clipy
    </button>
  ),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

const editRoute = '/dashboard/templates/[id]/edit';
const newRoute = '/dashboard/templates/new';

beforeEach(() => {
  editor.access = {};
  editor.loadError = null;
  editor.save.mockReset();
  editor.setVersion.mockReset();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => cleanup());

const openTheEditor = async (at = '/dashboard/templates/tpl-1/edit/') => {
  navigation.reset(at, { routes: [editRoute, newRoute, '/dashboard/templates'] });
  await renderSettled(<RoutedPages pages={{ [editRoute]: <TemplateEditor />, [newRoute]: <TemplateEditor /> }} />);
};

const titleField = () => inputNamed('Title');

describe('TemplateEditor that could not load the Template', () => {
  it('says why and goes back to My Templates', async () => {
    editor.loadError = 'Template not found';
    await openTheEditor();

    expect(screen.getByText('Unable to load template')).toBeDefined();
    expect(document.body.textContent).toContain('Template not found');

    await pressTheButton('Back to Templates');
    expect(navigation.url()).toBe('/dashboard/templates/');
  });
});

describe('TemplateEditor save of an existing Template', () => {
  it('keeps the editor open with the saved values as the new baseline', async () => {
    const saved = buildTemplateEditorFormValues({ title: 'Launch checklist v2' });
    editor.save.mockResolvedValue({ success: true, errors: [], savedValues: saved } satisfies TemplateEditorSaveResult);
    await openTheEditor();
    await typeInto(titleField(), 'Launch checklist v2');

    await pressTheButton('Save');

    expect(editor.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Launch checklist v2' }));
    expect(navigation.url()).toBe('/dashboard/templates/tpl-1/edit/');
    expect(titleField().value).toBe('Launch checklist v2');
  });

  it('lists the reasons a save was refused, without Load latest when no newer version is involved', async () => {
    editor.save.mockResolvedValue({ success: false, errors: [{ field: 'title', message: 'Title is required' }] });
    await openTheEditor();

    await pressTheButton('Save');

    expect(document.body.textContent).toContain('Title is required');
    expect(screen.queryByRole('button', { name: 'Load latest version' })).toBeNull();
  });

  it('ignores a Save pressed in the same moment a file starts uploading', async () => {
    await openTheEditor();

    await pressTheButton('Attach a file and save at once');

    expect(editor.save).not.toHaveBeenCalled();
  });
});

describe('TemplateEditor preview and outline', () => {
  it('previews the Template being edited', async () => {
    await openTheEditor();

    await pressTheButton('Preview');

    expect(screen.getByRole('dialog', { name: 'Template preview' }).textContent).toContain('Launch checklist');
  });

  it('opens the outline in a sheet where it does not fit beside the form', async () => {
    await openTheEditor();

    await pressTheButton('Outline');

    expect(screen.getByRole('dialog')).toBeDefined();
  });
});

describe('TemplateEditor kept draft and plan notices', () => {
  const keptDraft = { savedAt: '2026-09-28T10:00:00.000Z', values: buildTemplateEditorFormValues({ title: 'Kept while upgrading' }) };

  it('restores the kept draft as unsaved work on top of the version it was based on', async () => {
    const restoreDraft = vi.fn(() => ({ ...keptDraft, baseVersion: 2 }));
    editor.access = { draft: keptDraft, restoreDraft };
    await openTheEditor();

    await pressTheButton('Restore draft');

    expect(titleField().value).toBe('Kept while upgrading');
    expect(editor.setVersion).toHaveBeenCalledWith(2);
  });

  it('asks before the kept draft replaces edits made on the page, and keeps them on No', async () => {
    const restoreDraft = vi.fn(() => keptDraft);
    editor.access = { draft: keptDraft, restoreDraft };
    await openTheEditor();
    vi.mocked(navigation.window.confirm).mockReturnValue(false);
    await typeInto(titleField(), 'Typed on the page');

    await pressTheButton('Restore draft');

    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(restoreDraft).not.toHaveBeenCalled();
    expect(titleField().value).toBe('Typed on the page');
  });

  it('starts the upgrade from the plan notice', async () => {
    const startUpgrade = vi.fn(async () => true);
    editor.access = {
      notice: { action: 'checkout', message: 'Template limit reached.', title: 'Upgrade to Pro to save this template' },
      startUpgrade,
    };
    await openTheEditor();

    await pressTheButton('Upgrade to Pro');

    expect(startUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe('TemplateEditor new Template from Clipy', () => {
  it('fills the form with the generated draft, after asking when it would replace edits', async () => {
    editor.generatedDraft = buildTemplateEditorFormValues({ title: 'From the recording' });
    await openTheEditor('/dashboard/templates/new/');
    await typeInto(titleField(), 'Typed first');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate from Clipy' }));
    });

    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(titleField().value).toBe('From the recording');
  });
});

describe('TemplateEditor save that finished after the user moved on', () => {
  it('reports the failure as a toast', async () => {
    editor.save.mockResolvedValue({ success: false, stale: true, errors: [{ field: 'title', message: 'Title is required' }] });
    await openTheEditor();

    await pressTheButton('Save');

    expect(toast.error).toHaveBeenCalledWith('Template not saved: Title is required');
  });
});
