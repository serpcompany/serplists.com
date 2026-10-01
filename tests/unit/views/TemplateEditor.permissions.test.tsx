import { renderPageAt } from '../../support/mockedNextNavigation';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateEditor from '@/views/TemplateEditor';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

const mockModel = vi.fn();
const workspace = {
  activeTeamId: undefined as string | undefined,
  canEditTemplates: true,
  isWorkspaceLoading: false,
  teams: [] as Array<{ id: string; role: string }>,
};

vi.mock('@/features/template-editor/useTemplateEditorModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/template-editor/useTemplateEditorModel')>()),
  useTemplateEditorModel: () => mockModel(),
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jane@test.com', username: 'jane' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspace,
}));
vi.mock('@/features/template-editor/useTemplateEditorAccess', async () => {
  const { editorAccess } = await import('../../fixtures/templateEditorHooks');
  return { useTemplateEditorAccess: () => editorAccess() };
});

const loadedModel = (ownership: Record<string, unknown> | undefined) => ({
  initialValues: buildTemplateEditorFormValues({ title: 'Launch checklist' }),
  isSaving: false,
  loading: false,
  loadError: null,
  ownership,
  save: vi.fn(),
  templateSlug: 'launch-checklist',
});

const renderEdit = () =>
  renderPageAt('/dashboard/templates/template-1/edit/', { '/dashboard/templates/[id]/edit': <TemplateEditor /> });
const renderNew = () => renderPageAt('/dashboard/templates/new/', { '/dashboard/templates/new': <TemplateEditor /> });
const hasSaveButton = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*Save(?:(?!<\/button>).)*<\/button>/.test(html);

beforeEach(() => {
  workspace.activeTeamId = undefined;
  workspace.canEditTemplates = true;
  workspace.isWorkspaceLoading = false;
  workspace.teams = [];
});

describe('TemplateEditor permissions, which show why instead of a form whose every save the API would refuse', () => {
  it('shows an Organization viewer a read-only notice instead of the form', async () => {
    workspace.teams = [{ id: 'team-1', role: 'viewer' }];
    mockModel.mockReturnValue(loadedModel({ userId: 'creator-1', teamId: 'team-1', ownerType: 'team' }));

    const html = await renderEdit();

    expect(html).toContain("You can&#x27;t edit this template");
    expect(html).toContain('href="/dashboard/templates/template-1/"');
    expect(html).not.toContain('Launch checklist');
    expect(hasSaveButton(html)).toBe(false);
  });

  it("shows the notice for another user's public template", async () => {
    mockModel.mockReturnValue(loadedModel({ userId: 'someone-else', ownerType: 'user' }));

    const html = await renderEdit();

    expect(html).toContain("You can&#x27;t edit this template");
    expect(hasSaveButton(html)).toBe(false);
  });

  it('opens the form for an Organization editor whose Organization is not active', async () => {
    workspace.teams = [{ id: 'team-1', role: 'editor' }];
    mockModel.mockReturnValue(loadedModel({ userId: 'creator-1', teamId: 'team-1', ownerType: 'team' }));

    const html = await renderEdit();

    expect(html).not.toContain("You can&#x27;t edit this template");
    expect(hasSaveButton(html)).toBe(true);
  });

  it('opens the form for the owner of a Personal template', async () => {
    mockModel.mockReturnValue(loadedModel({ userId: 'user-1', ownerType: 'user' }));

    expect(hasSaveButton(await renderEdit())).toBe(true);
  });

  it("waits for the viewer's Organizations before showing either", async () => {
    workspace.isWorkspaceLoading = true;
    mockModel.mockReturnValue(loadedModel({ userId: 'creator-1', teamId: 'team-1', ownerType: 'team' }));

    const html = await renderEdit();

    expect(html).toContain('animate-spin');
    expect(html).not.toContain("You can&#x27;t edit this template");
    expect(hasSaveButton(html)).toBe(false);
  });

  it('shows the notice on the new-template route to a role that cannot create templates', async () => {
    workspace.activeTeamId = 'team-1';
    workspace.canEditTemplates = false;
    workspace.teams = [{ id: 'team-1', role: 'runner' }];
    mockModel.mockReturnValue(loadedModel(undefined));

    const html = await renderNew();

    expect(html).toContain("You can&#x27;t create templates here");
    expect(hasSaveButton(html)).toBe(false);
  });
});
