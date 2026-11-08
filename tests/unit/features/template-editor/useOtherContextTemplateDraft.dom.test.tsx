import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readTemplateDraft, saveTemplateDraft } from '@/features/template-editor/templateDraftStore';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { renderSettled } from '../../../support/renderInTheDom';

const workspace = vi.hoisted(() => ({
  activeTeamId: undefined as string | undefined,
  selectWorkspace: vi.fn<(workspaceId: string) => void>(),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: workspace.activeTeamId,
    isWorkspaceLoading: false,
    selectWorkspace: workspace.selectWorkspace,
    teams: [
      { id: 'team-acme', name: 'Acme', role: 'editor' },
      { id: 'team-beta', name: 'Beta', role: 'viewer' },
    ],
  }),
}));

import { useOtherContextTemplateDraft } from '@/features/template-editor/useOtherContextTemplateDraft';

const halfWritten = buildTemplateEditorFormValues({ title: 'Launch plan' });

beforeEach(() => {
  window.sessionStorage.clear();
  workspace.activeTeamId = undefined;
  workspace.selectWorkspace.mockReset();
});

let unmount: () => void = () => undefined;
afterEach(() => unmount());

async function openANewTemplate({ userId }: { userId: string | undefined } = { userId: 'user-1' }) {
  let offer: ReturnType<typeof useOtherContextTemplateDraft> | undefined;
  function NewTemplate() {
    offer = useOtherContextTemplateDraft({ enabled: true, userId });
    return null;
  }
  const rendered = await renderSettled(<NewTemplate />);
  unmount = rendered.unmount;
  return () => {
    if (!offer) throw new Error('The new template page did not render');
    return offer;
  };
}

describe('a new template started in another context', () => {
  it("offers to switch to the Organization holding the draft, and switches there", async () => {
    saveTemplateDraft({ userId: 'user-1', teamId: 'team-acme' }, halfWritten);

    const page = await openANewTemplate();

    expect(page().otherContextDraft).toMatchObject({ teamId: 'team-acme', name: 'Acme', draft: { values: { title: 'Launch plan' } } });
    page().switchToDraftContext();
    expect(workspace.selectWorkspace).toHaveBeenCalledWith('team-acme');
  });

  it('offers a Personal draft while an Organization is open, and switches to Personal', async () => {
    workspace.activeTeamId = 'team-acme';
    saveTemplateDraft({ userId: 'user-1' }, halfWritten);

    const page = await openANewTemplate();

    expect(page().otherContextDraft).toMatchObject({ teamId: null, name: 'Personal' });
    page().switchToDraftContext();
    expect(workspace.selectWorkspace).toHaveBeenCalledWith('personal');
  });

  it('does not offer a draft in an Organization where the person cannot add templates, or one they left', async () => {
    saveTemplateDraft({ userId: 'user-1', teamId: 'team-beta' }, halfWritten);
    saveTemplateDraft({ userId: 'user-1', teamId: 'team-gone' }, halfWritten);

    const page = await openANewTemplate();

    expect(page().otherContextDraft).toBeNull();
    page().switchToDraftContext();
    expect(workspace.selectWorkspace).not.toHaveBeenCalled();
  });

  it('deletes the draft when it is discarded and stops offering it', async () => {
    saveTemplateDraft({ userId: 'user-1', teamId: 'team-acme' }, halfWritten);
    const page = await openANewTemplate();

    await act(async () => page().discardOtherContextDraft());

    expect(page().otherContextDraft).toBeNull();
    expect(readTemplateDraft({ userId: 'user-1', teamId: 'team-acme' })).toBeNull();
  });

  it('offers nothing to a visitor who is not signed in', async () => {
    saveTemplateDraft({ userId: 'user-1', teamId: 'team-acme' }, halfWritten);
    const page = await openANewTemplate({ userId: undefined });

    expect(page().otherContextDraft).toBeNull();
    await act(async () => page().discardOtherContextDraft());
    expect(readTemplateDraft({ userId: 'user-1', teamId: 'team-acme' })).not.toBeNull();
  });
});
