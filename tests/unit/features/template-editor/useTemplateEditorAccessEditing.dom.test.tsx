import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readTemplateEditDraft, saveTemplateEditDraft } from '@/features/template-editor/templateDraftStore';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const workspace = vi.hoisted(() => ({ activeTeamId: undefined as string | undefined }));
const session = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  templatesLoading: false,
  allTemplates: [] as Array<{ id: string; userId: string; teamId?: string }>,
}));
const getBillingStatus = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    teams: [{ id: 'team-acme', name: 'Acme' }],
    selectWorkspace: vi.fn(),
    isWorkspaceLoading: false,
    isTeamWorkspace: Boolean(workspace.activeTeamId),
    getPermissions: () => ({ canEditTemplates: true }),
    activeTeamId: workspace.activeTeamId,
  }),
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({ allTemplates: session.allTemplates, templatesLoading: session.templatesLoading }),
}));
vi.mock('@/lib/api', () => ({ api: { getBillingStatus } }));

import { useTemplateEditorAccess } from '@/features/template-editor/useTemplateEditorAccess';

const editedValues = buildTemplateEditorFormValues({ title: 'Launch plan, edited' });
const editor = { userId: 'user-1', templateId: 'template-7' };
const allowLeave = vi.fn();
const guardLeave = vi.fn();

const unmounts: Array<() => void> = [];
beforeEach(() => {
  window.sessionStorage.clear();
  navigation.reset('/dashboard/templates/template-7/edit/');
  workspace.activeTeamId = undefined;
  session.user = { id: 'user-1' };
  session.templatesLoading = false;
  session.allTemplates = [];
  getBillingStatus.mockReset();
  getBillingStatus.mockResolvedValue({ billingEnabled: true, plan: 'free', limits: { maxTemplates: 1 } });
  allowLeave.mockReset();
  guardLeave.mockReset();
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function openTheEditor(isCreate = false) {
  const access = await mountQueryHook(() =>
    useTemplateEditorAccess({
      isCreate,
      templateId: isCreate ? undefined : 'template-7',
      getValues: () => editedValues,
      getVersion: () => 4,
      allowLeave,
      guardLeave,
    }),
  );
  unmounts.push(access.unmount);
  await act(settle);
  return access.current;
}

describe('the template editor while it edits a saved template', () => {
  it('keeps the edits, with the version they started from, when the person signs in again', async () => {
    const access = await openTheEditor();

    access().signIn();

    expect(readTemplateEditDraft(editor)).toMatchObject({ values: { title: 'Launch plan, edited' }, baseVersion: 4 });
    expect(allowLeave).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe(`/login/?next=${encodeURIComponent('/dashboard/templates/template-7/edit/')}`);
  });

  it('offers the edits kept from before, and drops them once they save', async () => {
    saveTemplateEditDraft(editor, { values: editedValues, baseVersion: 3 });
    const access = await openTheEditor();
    expect(access().draft).toMatchObject({ values: { title: 'Launch plan, edited' }, baseVersion: 3 });

    await act(async () => access().settleDraft({ success: true, errors: [] }, editedValues));

    expect(access().draft).toBeNull();
    expect(readTemplateEditDraft(editor)).toBeNull();
  });

  it('deletes the kept edits when they are discarded', async () => {
    saveTemplateEditDraft(editor, { values: editedValues, baseVersion: 3 });
    const access = await openTheEditor();

    await act(async () => access().discardDraft());

    expect(access().draft).toBeNull();
    expect(readTemplateEditDraft(editor)).toBeNull();
  });

  it('shows a sign-in notice for a save refused because the session ended, and none once a save succeeds', async () => {
    const access = await openTheEditor();

    let shown = false;
    await act(async () => {
      shown = access().handleSaveResult({ success: false, errors: [], failure: { kind: 'auth_required', message: 'Sign in.' } });
    });
    expect(shown).toBe(true);
    expect(access().notice).toMatchObject({ action: 'sign_in' });

    await act(async () => {
      shown = access().handleSaveResult({ success: true, errors: [] });
    });
    expect(shown).toBe(false);
    expect(access().notice).toBeNull();
  });

  it("reads no plan, since only a new template counts against the plan's limit", async () => {
    await openTheEditor();

    expect(getBillingStatus).not.toHaveBeenCalled();
  });
});

describe('the template editor for a new template in an Organization', () => {
  it("reads the Organization's plan", async () => {
    workspace.activeTeamId = 'team-acme';

    await openTheEditor(true);

    expect(getBillingStatus).toHaveBeenCalledWith({ teamId: 'team-acme' });
  });
});

describe('the template editor for a new template', () => {
  it('keeps nothing for a visitor who is not signed in, and still sends them to sign in', async () => {
    session.user = null;
    navigation.reset('/dashboard/templates/new/');
    const access = await openTheEditor(true);

    expect(access().keepDraft()).toBe(false);
    access().signIn();

    expect(allowLeave).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    expect(navigation.url()).toBe(`/login/?next=${encodeURIComponent('/dashboard/templates/new/')}`);
  });

  it('shows no plan limit while the templates it counts are still loading', async () => {
    session.templatesLoading = true;
    session.allTemplates = [{ id: 'template-1', userId: 'user-1' }];

    const access = await openTheEditor(true);

    expect(getBillingStatus).toHaveBeenCalledTimes(1);
    expect(access().notice).toBeNull();
  });

  it('shows the plan limit once the Free plan already holds a template', async () => {
    session.allTemplates = [{ id: 'template-1', userId: 'user-1' }];
    const access = await openTheEditor(true);

    expect(access().notice).toMatchObject({ action: 'checkout' });
  });
});

