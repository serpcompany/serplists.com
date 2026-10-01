import { renderPageAt } from '../../support/mockedNextNavigation';
import React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateEditor from '@/views/TemplateEditor';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { createPendingUploads } from '@/features/template-editor/pendingUploads';
import {
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  EDITOR_UPLOAD_IN_PROGRESS_MESSAGE,
} from '@/features/template-editor/navigationGuards';

import { editorAccess as buildAccess, editorState } from '../../fixtures/templateEditorHooks';

const mockUseTemplateEditorModel = vi.fn();
const mockUseTemplateEditorState = vi.fn();
const mockUseTemplateEditorAccess = vi.fn();
const mockUsePendingTemplateEditorUploads = vi.fn();
const useFormCalls = vi.fn();
const leaveGuardedWith = vi.fn();

vi.mock('@/features/template-editor/useTemplateEditorLeaveGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/template-editor/useTemplateEditorLeaveGuard')>();
  return {
    useTemplateEditorLeaveGuard: (...args: Parameters<typeof actual.useTemplateEditorLeaveGuard>) => {
      leaveGuardedWith(...args);
      return actual.useTemplateEditorLeaveGuard(...args);
    },
  };
});

vi.mock('@/features/template-editor/useTemplateEditorModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/template-editor/useTemplateEditorModel')>()),
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

const renderEditorAt = (location: string, appRouterPattern: string): string =>
  renderPageAt(location, { [appRouterPattern]: <TemplateEditor /> });

const keptDraft = () => ({
  savedAt: '2026-09-28T10:00:00.000Z',
  values: buildTemplateEditorFormValues({ title: 'Launch checklist' }),
});

const renderTheExistingTemplateEditor = () => {
  mockUseTemplateEditorModel.mockReturnValue({
    initialValues: buildTemplateEditorFormValues({ title: 'Existing template' }),
    isSaving: false,
    loading: false,
    loadError: null,
    save: vi.fn(),
    templateSlug: 'existing-template',
  });
  mockUseTemplateEditorState.mockReturnValue(editorState());

  return renderEditorAt('/dashboard/templates/template-1/edit', '/dashboard/templates/[id]/edit');
};

describe('TemplateEditor page', () => {
  it('uses the v0-style split editor shell, with the outline beside the form from lg, instead of the old wide content canvas', async () => {
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

    mockUseTemplateEditorState.mockReturnValue(editorState());

    const html = await renderEditorAt('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Template Settings');
    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Sections');
    expect(html).toContain('data-slot="template-outline"');
    expect(html).toContain('lg:grid-cols-[18rem_minmax(0,1fr)]');
    expect(html).not.toContain('text-4xl');
    expect(html).not.toContain('Add a section from the outline to start building this template.');
    expect(html).toContain('Generate from Clipy');
  });

  it('does not show Clipy import controls while editing an existing template', async () => {
    const html = await renderTheExistingTemplateEditor();

    expect(html).not.toContain('Generate from Clipy');
  });

  const renderSavingEditor = (location: string, appRouterPattern: string): string => {
    mockUseTemplateEditorModel.mockReturnValue({
      initialValues: buildTemplateEditorFormValues({ title: 'Draft template' }),
      isSaving: true,
      loading: false,
      loadError: null,
      save: vi.fn(),
      templateSlug: undefined,
    });
    mockUseTemplateEditorState.mockReturnValue(editorState());

    return renderEditorAt(location, appRouterPattern);
  };

  it('locks the new-template editor while it is being created, since the create leaves the page and could not keep edits made meanwhile', async () => {
    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });

  it('keeps an existing template editable while it saves, since an update stays on the page and keeps edits made meanwhile', async () => {
    const html = await renderSavingEditor(
      '/dashboard/templates/template-1/edit',
      '/dashboard/templates/[id]/edit',
    );

    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
  });

  it('offers an Upgrade to Pro button, not only text, when the plan cannot save the template', async () => {
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
      buildAccess({ draft: keptDraft() }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Launch checklist');
    expect(html).toMatch(/<button[^>]*>Restore draft<\/button>/);
    expect(html).toMatch(/<button[^>]*>Discard<\/button>/);
  });

  it('disables Restore draft and Discard while a new template is being created, whose finish clears the kept draft and leaves the page', async () => {
    mockUseTemplateEditorAccess.mockReturnValue(
      buildAccess({ draft: keptDraft() }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Restore draft<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Discard<\/button>/);
  });

  it('offers to switch to the Organization a kept draft belongs to', async () => {
    mockUseTemplateEditorAccess.mockReturnValue(
      buildAccess({
        otherContextDraft: {
          teamId: 'org-1',
          name: 'Acme',
          draft: keptDraft(),
        },
      }),
    );

    const html = await renderSavingEditor('/dashboard/templates/new', '/dashboard/templates/new');

    expect(html).toContain('Unsaved template draft in Acme');
    expect(html).toContain('Launch checklist');
    expect(html).toMatch(/<button[^>]*>Switch to Acme<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>Restore draft<\/button>/);
  });

  it('disables Save while a file is still uploading, which a save now would store without', async () => {
    mockUsePendingTemplateEditorUploads.mockImplementation(() => ({
      uploads: createPendingUploads(),
      pendingCount: 1,
    }));
    const html = await renderTheExistingTemplateEditor();

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Uploading\.\.\.<\/button>/);
  });

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
      '/dashboard/templates/[id]/edit',
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
      '/dashboard/templates/[id]/edit',
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
      '/dashboard/templates/[id]/edit',
    );

    expect(html).toContain('/profile/teammate/launch');
    expect(html).not.toContain('/profile/jane/');
  });

  it('guards every way out of the editor while it holds unsaved work, through the template editor leave guard', async () => {
    mockUsePendingTemplateEditorUploads.mockImplementation(() => ({ uploads: createPendingUploads(), pendingCount: 1 }));
    leaveGuardedWith.mockClear();
    await renderTheExistingTemplateEditor();
    expect(leaveGuardedWith).toHaveBeenLastCalledWith(true, EDITOR_UPLOAD_IN_PROGRESS_MESSAGE, expect.any(Function));

    mockUsePendingTemplateEditorUploads.mockImplementation(() => ({ uploads: createPendingUploads(), pendingCount: 0 }));
    await renderTheExistingTemplateEditor();
    expect(leaveGuardedWith).toHaveBeenLastCalledWith(false, EDITOR_UNSAVED_CHANGES_MESSAGE, expect.any(Function));
  });
});
