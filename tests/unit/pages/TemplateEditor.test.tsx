import React from 'react';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateEditor from '@/pages/TemplateEditor';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

const mockUseTemplateEditorModel = vi.fn();
const mockUseTemplateEditorState = vi.fn();
const mockUseTemplateEditorAccess = vi.fn();

const buildAccess = (overrides: Record<string, unknown> = {}) => ({
  draft: null,
  discardDraft: vi.fn(),
  handleSaveResult: vi.fn(() => false),
  isStartingCheckout: false,
  notice: null,
  restoreDraft: vi.fn(),
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

vi.mock('@/features/template-editor/useTemplateEditorAccess', () => ({
  useTemplateEditorAccess: (...args: unknown[]) =>
    mockUseTemplateEditorAccess(...args),
}));

beforeEach(() => {
  mockUseTemplateEditorAccess.mockReturnValue(buildAccess());
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
});
