import { navigation } from '../../support/mockedNextNavigation';
import { clickInTheDialog, openAndConfirm, theDialogsToClose } from '../../support/confirmDialogs';
import { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { readGuestRun, saveGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';
import GuestRun from '@/views/GuestRun';

import { contentAt, present, subTaskAt, taskAt } from '../../support/elements';
import { guestRunTemplate } from '../../support/guestRuns';
import { queryClientsClearedAfterEachTest } from '../../support/queryClientsPerTest';
import { renderSettled, theInMemoryBrowserAsTheWindow, theButtonOrMenuItemNamed } from '../../support/renderInTheDom';

const { authState, saving, templateRecord, workspace } = vi.hoisted(() => ({
  authState: { isAuthenticated: false, isLoading: false, user: null as { id: string } | null },
  saving: { isSaving: false, save: vi.fn() },
  templateRecord: {
    loadError: null as string | null,
    loading: false,
    notFound: false,
    reload: () => undefined,
    template: null as ChecklistTemplate | null,
  },
  workspace: { canRunTemplates: true, isWorkspaceLoading: false },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspace }));
vi.mock('@/features/guest-runs/useSaveGuestRunToAccount', () => ({ useSaveGuestRunToAccount: () => saving }));
vi.mock('@/features/template-detail/useTemplateDetailRecord', () => ({ useTemplateDetailRecord: () => templateRecord }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();
const newQueryClient = queryClientsClearedAfterEachTest();

const RUN_PAGE = '/profile/alice/weekend-camping/run/';
const TEMPLATE_PAGE = '/profile/alice/weekend-camping/';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(authState, { isAuthenticated: false, isLoading: false, user: null });
  Object.assign(workspace, { canRunTemplates: true, isWorkspaceLoading: false });
  saving.isSaving = false;
  Object.assign(templateRecord, { loadError: null, loading: false, notFound: false, template: guestRunTemplate });
  navigation.reset(RUN_PAGE, { routes: ['/profile/[username]/[templateSlug]/run'] });
});

async function openTheRunPage() {
  await renderSettled(
    <QueryClientProvider client={newQueryClient()}>
      <GuestRun />
    </QueryClientProvider>,
  );
  await act(async () => {
    await navigation.settle();
  });
}

const storedRun = (): ChecklistRun => present(readGuestRun(guestRunTemplate.id), 'the stored guest run');

const thePageHeader = () => present(document.querySelector<HTMLElement>('[data-dashboard-page-header="true"]'), 'the page header');

const everyTaskDone = (run: ChecklistRun): ChecklistRun => ({
  ...run,
  sections: run.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isCompleted: true,
      contents: item.contents?.map((content) => ({
        ...content,
        subItems: content.subItems?.map((subItem) => ({ ...subItem, isCompleted: true })),
      })),
    })),
  })),
});

describe('the guest run page of a public Template', () => {
  it('starts a run for a visitor who is not signed in and opens it on its first task, kept in this browser', async () => {
    await openTheRunPage();

    expect(storedRun()).toMatchObject({ status: 'in_progress', templateId: 'template-camping' });
    const header = within(thePageHeader());
    expect(header.getByRole('heading', { level: 1 }).textContent).toBe(storedRun().title);
    expect(header.getByText('0 of 3 tasks finished')).toBeTruthy();
    expect(thePageHeader().textContent).toContain('This run is saved in this browser only.');
    expect(screen.getByRole('heading', { level: 2, name: 'Pack the tent' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^(Share|Rename|Stop sharing)$/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Weekend Camping' }).getAttribute('href')).toBe(TEMPLATE_PAGE);
  });

  it('opens the run this browser already holds, with its progress, instead of starting another', async () => {
    const started = startGuestRun(guestRunTemplate, 'Lake trip');
    saveGuestRun({
      ...started,
      sections: started.sections.map((section, index) =>
        index === 0 ? { ...section, items: section.items.map((item) => ({ ...item, isCompleted: item.id === 'task-food' })) } : section,
      ),
    });

    await openTheRunPage();

    expect(storedRun().id).toBe(started.id);
    const header = within(thePageHeader());
    expect(header.getByRole('heading', { level: 1 }).textContent).toBe('Lake trip');
    expect(header.getByText('1 of 3 tasks finished')).toBeTruthy();
  });

  it('sends a signed-in user with no run in this browser to the Template page, where Start Run starts a run in their account', async () => {
    Object.assign(authState, { isAuthenticated: true, user: { id: 'user-1' } });

    await openTheRunPage();

    expect(navigation.url()).toBe(TEMPLATE_PAGE);
    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
  });

  it('waits for the session check before deciding whether to start a run', async () => {
    authState.isLoading = true;

    await openTheRunPage();

    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
    expect(navigation.url()).toBe(RUN_PAGE);
  });

  it('keeps a ticked Sub-task in this browser', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    await openTheRunPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Poles' }));
    });

    await waitFor(() => {
      expect(subTaskAt(contentAt(taskAt(storedRun(), 0, 0), 0), 0).isCompleted).toBe(true);
    });
  });

  it('completes the run on the page, which stays open and shows it completed', async () => {
    saveGuestRun(everyTaskDone(startGuestRun(guestRunTemplate, 'Lake trip')));
    await openTheRunPage();

    await openAndConfirm('Complete run', 'Complete Run');

    await waitFor(() => {
      expect(storedRun().status).toBe('completed');
    });
    expect(toast.success).toHaveBeenCalledWith('Run completed');
    expect(navigation.url()).toBe(RUN_PAGE);
    expect(within(thePageHeader()).getByText('Completed')).toBeTruthy();
  });

  it('deletes the run after asking, goes back to the Template page and starts no other', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    await openTheRunPage();

    await act(async () => {
      fireEvent.click(theButtonOrMenuItemNamed('Delete run'));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Delete run');
    expect(dialog.textContent).toContain('Are you sure you want to delete this run?');
    await clickInTheDialog(dialog, 'Delete');
    await theDialogsToClose();

    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Run deleted');
    expect(navigation.url()).toBe(TEMPLATE_PAGE);
  });

  it('asks a visitor who is not signed in to log in or sign up to save it, and to come back to the run after', async () => {
    await openTheRunPage();

    const header = within(thePageHeader());
    const returnHere = `?next=${encodeURIComponent(RUN_PAGE)}`;
    expect(header.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(`/login/${returnHere}`);
    expect(header.getByRole('link', { name: 'sign up' }).getAttribute('href')).toBe(`/register/${returnHere}`);
    expect(header.queryByRole('button', { name: 'Save to account' })).toBeNull();
  });

  it('offers a signed-in user Save to account, which saves the notes still being typed too', async () => {
    Object.assign(authState, { isAuthenticated: true, user: { id: 'user-1' } });
    startGuestRun(guestRunTemplate, 'Lake trip');
    await openTheRunPage();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Task notes' }), { target: { value: 'Typed, not saved' } });
    });
    await act(async () => {
      fireEvent.click(within(thePageHeader()).getByRole('button', { name: 'Save to account' }));
    });

    expect(saving.save).toHaveBeenCalledWith({ 'task-tent': 'Typed, not saved' });
    expect(within(thePageHeader()).queryByRole('link', { name: 'Log in' })).toBeNull();
  });

  it('offers no Save to account to a role that cannot start runs in the active Organization, and waits while a save runs', async () => {
    Object.assign(authState, { isAuthenticated: true, user: { id: 'user-1' } });
    startGuestRun(guestRunTemplate, 'Lake trip');
    workspace.canRunTemplates = false;
    await openTheRunPage();
    expect(screen.queryByRole('button', { name: 'Save to account' })).toBeNull();

    workspace.canRunTemplates = true;
    saving.isSaving = true;
    await openTheRunPage();
    expect(screen.getByRole('button', { name: 'Save to account' }).hasAttribute('disabled')).toBe(true);
  });

  it('says the Template was not found when it is not public under that owner', async () => {
    Object.assign(templateRecord, { notFound: true, template: null });

    await openTheRunPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Template not found' })).toBeTruthy();
    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
  });
});
