import React from 'react';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateEditor from '@/pages/TemplateEditor';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { createPendingUploads } from '@/features/template-editor/pendingUploads';

const mockUseTemplateEditorModel = vi.fn();
const mockUseTemplateEditorState = vi.fn();
const mockUseTemplateEditorAccess = vi.fn();
const mockUsePendingTemplateEditorUploads = vi.fn();
const useFormCalls = vi.fn();

const buildAccess = (overrides: Record<string, unknown> = {}) => ({
  draft: null,
  discardDraft: vi.fn(),
  handleSaveResult: vi.fn(() => false),
  isStartingCheckout: false,
  notice: null,
  restoreDraft: vi.fn(),
  settleDraft: vi.fn(),
  signIn: vi.fn(),
  startUpgrade: vi.fn(),
  ...overrides,
});

vi.mock('@/features/template-editor/useTemplateEditorModel', () => ({
  useTemplateEditorModel: (...args: unknown[]) =>
    mockUseTemplateEditorModel(...args),
}));

vi.mock('@/hooks/useTemplateEditorState', () => ({
  useTemplateEditorState: (...args: unknown[]) =>
    mockUseTemplateEditorState(...args),
}));

const mockUser = { id: 'user-1', email: 'jane@test.com', username: 'jane' };
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ canEditTemplates: true, isWorkspaceLoading: false, teams: [] }),
}));

vi.mock('@/features/template-editor/useTemplateEditorAccess', () => ({
  useTemplateEditorAccess: (...args: unknown[]) =>
    mockUseTemplateEditorAccess(...args),
}));

vi.mock('@/features/template-editor/pendingUploads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/template-editor/pendingUploads')>()),
  usePendingTemplateEditorUploads: (...args: unknown[]) =>
    mockUsePendingTemplateEditorUploads(...args),
}));

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useForm: (props?: Parameters<typeof actual.useForm>[0]) => {
      useFormCalls(props);
      return actual.useForm(props);
    },
  };
});

beforeEach(() => {
  useFormCalls.mockClear();
  mockUseTemplateEditorAccess.mockReturnValue(buildAccess());
  mockUsePendingTemplateEditorUploads.mockImplementation(() => ({
    uploads: createPendingUploads(),
    pendingCount: 0,
  }));
});

// The editor's leave guard (useBlocker) needs a data router, as in the app.
const renderEditorAt = (location: string, path: string): Promise<string> =>
  renderDataRoutes([{ path, element: <TemplateEditor /> }], location);

describe('TemplateEditor page', () => {
  it('uses the v0-style split editor shell instead of the old wide content canvas', async () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({
        title: 'New Employee Onboarding',
        description: 'A comprehensive checklist for onboarding new team members',
        sections: [
          {
            id: 'section-1',
            title: 'Before Day One',
            items: [
              {
                id: 'item-1',
                title: 'Send welcome email',
                contents: [],
              },
            ],
          },
        ],
      }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: 'new-employee-onboarding',
    });

    mockUseTemplateEditorState.mockReturnValue({
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
    });

    const html = await renderEditorAt('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Template Settings');
    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Sections');
    expect(html).toContain('bg-sidebar');
    expect(html).toContain('max-w-2xl');
    expect(html).not.toContain('text-4xl');
    expect(html).not.toContain('Add a section from the outline to start building this template.');
    expect(html).toContain('Generate from Clipy');
  });

  it('does not show Clipy import controls while editing an existing template', async () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Existing template' }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: 'existing-template',
    });
    mockUseTemplateEditorState.mockReturnValue({
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
    });

    const html = await renderEditorAt(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(html).not.toContain('Generate from Clipy');
  });

  const renderSavingEditor = (location: string, path: string): Promise<string> => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Draft template' }),
      isSaving: true,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: undefined,
    });
    mockUseTemplateEditorState.mockReturnValue({
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
    });

    return renderEditorAt(location, path);
  };

  // A create leaves the page when it finishes, so edits made meanwhile could not be kept.
  it('locks the new-template editor while it is being created', async () => {
    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });

  // An update stays on the page and keeps edits made during the save.
  it('keeps an existing template editable while it saves', async () => {
    const html = await renderSavingEditor(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
  });

  // Free Personal allows one template: the editor must offer the upgrade, not only text.
  it('offers Upgrade to Pro when the plan cannot save the template', async () => {
    mockUseTemplateEditorAccess.mockReturnValue(
      buildAccess({
        notice: {
          action: 'checkout',
          message: 'Template limit reached. Upgrade to create more templates.',
          title: 'Upgrade to Pro to save this template',
        },
      }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Template limit reached. Upgrade to create more templates.');
    expect(html).toMatch(/<button[^>]*>Upgrade to Pro<\/button>/);
  });

  it('offers to restore a draft kept while the user upgraded', async () => {
    mockUseTemplateEditorAccess.mockReturnValue(
      buildAccess({
        draft: {
          savedAt: '2026-09-28T10:00:00.000Z',
          values: buildTemplateEditorFormValues({ title: 'Launch checklist' }),
        },
      }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Launch checklist');
    expect(html).toMatch(/<button[^>]*>Restore draft<\/button>/);
    expect(html).toMatch(/<button[^>]*>Discard<\/button>/);
  });

  // A draft restored now would be wiped when the create finishes (the kept draft is
  // cleared and the page moves on), so Restore and Discard wait for it.
  it('disables Restore draft and Discard while a new template is being created', async () => {
    mockUseTemplateEditorAccess.mockReturnValue(
      buildAccess({
        draft: {
          savedAt: '2026-09-28T10:00:00.000Z',
          values: buildTemplateEditorFormValues({ title: 'Launch checklist' }),
        },
      }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Restore draft<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Discard<\/button>/);
  });

  // Saving now would store the block without the file.
  it('disables Save while a file is still uploading', async () => {
    mockUsePendingTemplateEditorUploads.mockImplementation(() => ({
      uploads: createPendingUploads(),
      pendingCount: 1,
    }));
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Existing template' }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: 'existing-template',
    });
    mockUseTemplateEditorState.mockReturnValue({
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
    });

    const html = await renderEditorAt(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Uploading\.\.\.<\/button>/);
  });

  const editorState = () => ({
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
  });

  // A form created while loading starts from the blank defaults and is reset later,
  // after the outline has mounted: one frame of "New Template", and only the first
  // loaded section expanded.
  it('creates the editor form only once the template has loaded', async () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues(),
      isSaving: false,
      loading: true,
      loadError: null,
      save: vi.fn(),
      templateSlug: undefined,
    });
    mockUseTemplateEditorState.mockReturnValue(editorState());

    const html = await renderEditorAt(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(html).toContain('animate-spin');
    expect(html).not.toContain('New Template');
    expect(useFormCalls).not.toHaveBeenCalled();
  });

  it('starts the editor from the loaded template, every section expanded', async () => {
    const sections = ['Before', 'During', 'After'].map((title, index) => ({
      id: `section-${index}`,
      title,
      items: [{ id: `item-${index}`, title: `${title} task`, contents: [] }],
    }));
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Moving checklist', sections }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: 'moving-checklist',
    });
    mockUseTemplateEditorState.mockReturnValue(editorState());

    const html = await renderEditorAt(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(useFormCalls.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        defaultValues: expect.objectContaining({ title: 'Moving checklist' }),
      }),
    );
    expect(html).not.toContain('New Template');
    for (const title of ['Before', 'During', 'After']) {
      expect(html).toContain(`aria-label="Collapse ${title}"`);
      expect(html).toContain(`${title} task`);
    }
  });
  // The Search & SEO preview shows the public page: /profile/<creator>/<slug>.
  it("previews a new template's public URL under the signed-in user", async () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Launch Checklist' }),
      isSaving: false,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: undefined,
    });
    mockUseTemplateEditorState.mockReturnValue({
      ...editorState(),
      showingSEO: true,
      showingTemplateInfo: false,
    });

    const html = await renderEditorAt('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('/profile/jane/launch-checklist');
    expect(html).not.toContain('example.com');
  });

  it("previews an existing template's public URL under its creator", async () => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Launch', slug: 'launch' }),
      isSaving: false,
      loading: false,
      loadError: null,
      ownerSlug: 'teammate',
      save: vi.fn(),
      templateSlug: 'launch',
    });
    mockUseTemplateEditorState.mockReturnValue({
      ...editorState(),
      showingSEO: true,
      showingTemplateInfo: false,
    });

    const html = await renderEditorAt(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/:id/edit',
    );

    expect(html).toContain('/profile/teammate/launch');
    expect(html).not.toContain('/profile/jane/');
  });
});
