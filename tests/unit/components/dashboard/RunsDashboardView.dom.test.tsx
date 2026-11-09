import { navigation } from '../../../support/mockedNextNavigation';
import {
  clickInTheDialog,
  openAndConfirm,
  openDialogs,
  openTheDeleteDialogWithNoneOpenBefore,
  theDialogsToClose,
} from '../../../support/confirmDialogs';
import React, { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inputNamed, openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../../support/renderInTheDom';
import { chooseTheOption } from '../../../support/selectOptions';
import { matchMediaWhere } from '../../../support/matchMedia';
import { deferred } from '../../../support/deferred';
import { toast } from 'sonner';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { api } from '@/lib/api';
import { createApiError } from '@/lib/api-errors';
import { PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: { createChecklistRunShare: vi.fn() } }));

const display = { wide: false };

theInMemoryBrowserAsTheWindow({
  matchMedia: matchMediaWhere((query) => display.wide && query === '(min-width: 90rem)'),
});

const run: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Website Launch - Q1 Release',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-1', title: 'Launch', items: [{ id: 'item-1', title: 'Review copy' }] }],
  startedAt: '2026-09-20T08:00:00Z',
  userId: 'user-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  display.wide = false;
});

async function renderRuns(onDeleteRun: (runId: string) => Promise<void>) {
  navigation.reset('/');
  await renderSettled(
    <RunsDashboardView runs={[run]} getRunPermissions={() => PERSONAL_PERMISSIONS} onDeleteRun={onDeleteRun} />,
  );
}

describe('RunsDashboardView delete', () => {
  it('names the action Delete and never says it cannot be undone, since the API only archives the run, which /dashboard/archive restores', async () => {
    const onDeleteRun = vi.fn(async () => undefined);
    await renderRuns(onDeleteRun);

    expect((await openTheMenu('Run options')).map((item) => item.textContent)).toContain('Delete');

    const { dialog, title, description } = await openTheDeleteDialogWithNoneOpenBefore();
    expect(dialog).toBeDefined();
    expect(title).toBe('Delete run');
    expect(description).toBe('Are you sure you want to delete this run?');
    expect(dialog.textContent).not.toMatch(/cannot be undone|archiv/i);

    await clickInTheDialog(dialog, 'Delete');

    expect(onDeleteRun).toHaveBeenCalledWith('run-1');
    expect(toast.success).toHaveBeenCalledWith('Run deleted');
    await theDialogsToClose();
  });

  it('says the run could not be deleted when the request fails without a message', async () => {
    await renderRuns(vi.fn(async () => Promise.reject('offline')));

    await openTheMenu('Run options');
    await openAndConfirm('Delete');

    expect(toast.error).toHaveBeenCalledWith('Failed to delete run.');
    expect(openDialogs()).toHaveLength(1);
  });

  it('closes the dialog when the run was already deleted elsewhere, as the reloaded list drops it, instead of offering a retry that fails the same way', async () => {
    const error = createApiError(404, { error: 'Checklist not found or unauthorized' });
    await renderRuns(vi.fn(async () => Promise.reject(error)));

    await openTheMenu('Run options');
    await openAndConfirm('Delete');

    expect(toast.error).toHaveBeenCalledWith('Checklist not found or unauthorized');
    await theDialogsToClose();
  });
});

const runOf = (id: string, templateId: string, title: string): ChecklistRun => ({
  id,
  templateId,
  title,
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-09-20T08:00:00Z',
  userId: 'user-1',
});

const runs = [runOf('run-1', 'tpl-a', 'Audit One'), runOf('run-2', 'tpl-a', 'Audit Two'), runOf('run-3', 'tpl-b', 'Launch One')];
const templates = [
  { id: 'tpl-a', isPublic: false, title: 'Alpha Audit' },
  { id: 'tpl-b', isPublic: false, title: 'Beta Launch' },
  { id: 'tpl-quiet', isPublic: false, title: 'Quiet Template' },
];

async function openTheRunsAt(url: string) {
  navigation.reset(url);
  await renderSettled(
    <RunsDashboardView
      getRunPermissions={() => PERSONAL_PERMISSIONS}
      onDeleteRun={vi.fn()}
      runs={runs}
      workspaceTemplates={templates}
    />,
  );
}

const shownRunTitles = () => screen.queryAllByRole('link').map((link) => link.textContent).filter((text) => text?.includes(' One') || text?.includes(' Two'));

describe("the runs page's Template filter", () => {
  it('opens with only the runs of the Template in ?template=, naming it in the Template filter', async () => {
    await openTheRunsAt('/dashboard/runs/?template=tpl-a');

    expect(shownRunTitles()).toEqual(['Audit One', 'Audit Two']);
    expect(screen.getByRole('combobox', { name: 'Template' }).textContent).toContain('Alpha Audit');
  });

  it('shows every run, and All templates, without a Template in the URL', async () => {
    await openTheRunsAt('/dashboard/runs/');

    expect(shownRunTitles()).toEqual(['Audit One', 'Audit Two', 'Launch One']);
    expect(screen.getByRole('combobox', { name: 'Template' }).textContent).toContain('All templates');
  });

  it('says a Template with no runs has none yet, rather than that nothing matched, and Show all runs takes the filter out of the URL', async () => {
    await openTheRunsAt('/dashboard/runs/?template=tpl-quiet');

    expect(screen.getByText('No runs of this template yet')).toBeTruthy();
    expect(screen.getByText('Runs started from Quiet Template appear here.')).toBeTruthy();
    expect(screen.queryByText('No runs found')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show all runs' }));
    });

    expect(navigation.url()).toBe('/dashboard/runs/');
    expect(shownRunTitles()).toEqual(['Audit One', 'Audit Two', 'Launch One']);
  });
});

const alice = { userId: 'user-a', name: 'Alice Admin', username: 'alice' };
const longTitle = 'A run title long enough that the table truncates it instead of wrapping its row';
const provenanceRuns: ChecklistRun[] = [
  { ...runOf('run-web', 'tpl-a', 'Audit One'), provenance: { origin: 'web', startedBy: alice }, updatedAt: '2026-09-22T08:00:00Z' },
  { ...runOf('run-mcp', 'tpl-b', longTitle), provenance: { origin: 'mcp', startedBy: { userId: 'user-b', name: null, username: 'bob' } } },
  { ...runOf('run-old', 'tpl-gone', 'Legacy One'), status: 'completed' },
];

const rowOf = (runTitle: string): HTMLElement => {
  const row = screen.getAllByRole('row').find((candidate) => within(candidate).queryByRole('link', { name: runTitle }));
  if (!row) throw new Error(`No row for ${runTitle}`);
  return row;
};

describe('the runs table on a wide screen', () => {
  async function openTheWideRuns() {
    display.wide = true;
    navigation.reset('/dashboard/runs/');
    await renderSettled(
      <RunsDashboardView getRunPermissions={() => PERSONAL_PERMISSIONS} onDeleteRun={vi.fn()} runs={provenanceRuns} workspaceTemplates={templates} />,
    );
  }

  it('lists the runs in a table with their Template, status, progress, starter, origin and dates, instead of cards', async () => {
    await openTheWideRuns();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Run', 'Template', 'Status', 'Progress', 'Started by', 'Origin', 'Started', 'Updated', 'Actions',
    ]);
    expect(screen.queryAllByRole('listitem')).toEqual([]);

    const web = within(rowOf('Audit One'));
    expect(web.getByRole('link', { name: 'Alpha Audit' }).getAttribute('href')).toBe('/dashboard/templates/tpl-a/');
    expect(web.getByText('Alice Admin')).toBeTruthy();
    expect(web.getByText('Web')).toBeTruthy();
    expect(web.getByText('In Progress')).toBeTruthy();
    expect(web.getByText('Sep 22, 2026')).toBeTruthy();
    expect(web.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/dashboard/runs/run-web/');
    expect(web.getByRole('button', { name: 'Run options' })).toBeTruthy();
  });

  it('clamps a long title to two lines with the whole title as its tooltip, and names a starter without a name by username', async () => {
    await openTheWideRuns();

    const mcp = within(rowOf(longTitle));
    expect(mcp.getByRole('link', { name: longTitle }).getAttribute('title')).toBe(longTitle);
    expect(mcp.getByText('@bob')).toBeTruthy();
    expect(mcp.getByText('MCP')).toBeTruthy();
  });

  it('says Unknown and shows a dash, never a guess, for a run with no provenance or Template, and offers View for a completed run', async () => {
    await openTheWideRuns();

    const old = within(rowOf('Legacy One'));
    expect(old.getByText('Unknown')).toBeTruthy();
    expect(old.getAllByText('—')).toHaveLength(2);
    expect(old.getByRole('link', { name: 'View' })).toBeTruthy();
    expect(old.getByText('Completed')).toBeTruthy();
  });
});

const staleShared: ChecklistRun = { ...runOf('run-stale', 'tpl-a', 'Audit One'), isStale: true, isPublic: true };
const stalePrivate: ChecklistRun = { ...runOf('run-old', 'tpl-b', 'Launch One'), isStale: true };

type RunsPageHandlers = Partial<
  Pick<
    React.ComponentProps<typeof RunsDashboardView>,
    'getRunPermissions' | 'loadError' | 'onRetryLoad' | 'onRevalidateRun' | 'onStopSharingRun'
  >
>;

async function openTheRunsWithActions(shownRuns: ChecklistRun[], handlers: RunsPageHandlers = {}) {
  navigation.reset('/dashboard/runs/');
  await renderSettled(
    <RunsDashboardView
      getRunPermissions={() => PERSONAL_PERMISSIONS}
      onDeleteRun={vi.fn()}
      runs={shownRuns}
      workspaceTemplates={templates}
      {...handlers}
    />,
  );
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

const chooseInTheMenu = async (item: string) => {
  const items = await openTheMenu('Run options');
  const chosen = items.find((candidate) => candidate.textContent === item);
  if (!chosen) throw new Error(`Run options has no ${item}`);
  await act(async () => {
    fireEvent.click(chosen);
  });
};

describe("a run's actions on the runs page", () => {
  it('revalidates a stale private run, saying so while it runs', async () => {
    const revalidating = deferred<void>();
    const onRevalidateRun = vi.fn(() => revalidating.promise);
    await openTheRunsWithActions([stalePrivate], { onRevalidateRun });

    await press('Revalidate');
    expect(screen.getByRole('button', { name: 'Revalidating...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      revalidating.resolve();
    });

    expect(onRevalidateRun).toHaveBeenCalledWith(stalePrivate);
    expect(toast.success).toHaveBeenCalledWith('Run revalidated against the latest template');
  });

  it('stops sharing a stale shared run from its row and from the menu', async () => {
    const stopping = deferred<void>();
    const onStopSharingRun = vi.fn(() => stopping.promise);
    await openTheRunsWithActions([staleShared], { onStopSharingRun });

    await press('Stop sharing to update');
    expect(screen.getByRole('button', { name: 'Stopping...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      stopping.resolve();
    });
    onStopSharingRun.mockResolvedValue(undefined);
    await chooseInTheMenu('Stop sharing');

    expect(onStopSharingRun.mock.calls).toEqual([['run-stale'], ['run-stale']]);
    expect(toast.success).toHaveBeenCalledWith('Sharing stopped. The old link no longer works.');
  });

  it('shows the compact revalidate and stop sharing buttons in the table on a wide screen', async () => {
    display.wide = true;
    const onRevalidateRun = vi.fn(async () => undefined);
    const onStopSharingRun = vi.fn(async () => undefined);
    await openTheRunsWithActions([staleShared, stalePrivate], { onRevalidateRun, onStopSharingRun });

    await act(async () => {
      fireEvent.click(within(rowOf('Launch One')).getByRole('button', { name: 'Revalidate' }));
      fireEvent.click(within(rowOf('Audit One')).getByRole('button', { name: 'Stop sharing to update' }));
    });

    expect(onRevalidateRun).toHaveBeenCalledWith(stalePrivate);
    expect(onStopSharingRun).toHaveBeenCalledWith('run-stale');
  });

  it('makes a share link from Share Run and shows it in the share dialog', async () => {
    vi.mocked(api.createChecklistRunShare).mockResolvedValue({ id: 'share-1', shareToken: 'token-1', sharePath: '/share/token-1/' });
    await openTheRunsWithActions([runOf('run-1', 'tpl-a', 'Audit One')]);

    await chooseInTheMenu('Share Run');

    expect(api.createChecklistRunShare).toHaveBeenCalledWith('run-1');
    const [dialog] = await screen.findAllByRole('dialog');
    if (!dialog) throw new Error('Share Run opened no dialog');
    expect(within(dialog).getByRole('textbox').getAttribute('value')).toMatch(/\/share\/token-1\/?$/);
  });

  it('deletes the run once when Delete is pressed again while its dialog closes', async () => {
    const onDeleteRun = vi.fn(async () => undefined);
    await renderRuns(onDeleteRun);
    await openTheMenu('Run options');
    const { dialog } = await openTheDeleteDialogWithNoneOpenBefore();

    await clickInTheDialog(dialog, 'Delete');
    await clickInTheDialog(dialog, 'Delete');
    await theDialogsToClose();

    expect(onDeleteRun).toHaveBeenCalledTimes(1);
  });

  it('keeps the run when the delete dialog is canceled', async () => {
    const onDeleteRun = vi.fn(async () => undefined);
    await renderRuns(onDeleteRun);

    await openTheMenu('Run options');
    await openAndConfirm('Delete', 'Cancel');
    await theDialogsToClose();

    expect(onDeleteRun).not.toHaveBeenCalled();
  });

  it('offers only Delete in the menu of a run the viewer may delete but not share', async () => {
    const deleteOnly = { canEditTemplates: false, canManage: true, canRun: false };
    await openTheRunsWithActions([staleShared], { getRunPermissions: () => deleteOnly, onStopSharingRun: vi.fn() });

    const items = await openTheMenu('Run options');

    expect(items.map((item) => item.textContent)).toEqual(['Delete']);
    expect(document.body.querySelector('[data-slot="dropdown-menu-separator"]')).toBeNull();
  });

  it('offers Retry when the runs failed to load', async () => {
    const onRetryLoad = vi.fn();
    await openTheRunsWithActions([], { loadError: new Error('HTTP 503'), onRetryLoad });

    await press('Retry');

    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it('keeps the load error on the page when Retry is pressed on a page given nothing to retry with', async () => {
    await openTheRunsWithActions([], { loadError: new Error('HTTP 503') });

    await press('Retry');

    expect(screen.getByText("Couldn't load your runs")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe("the runs page's search and filters", () => {
  it('says nothing matched a search, without offering the library', async () => {
    await openTheRunsAt('/dashboard/runs/');

    await typeInto(inputNamed('Search'), 'nothing like this');

    expect(screen.getByText('No runs found')).toBeTruthy();
    expect(screen.getByText('Try adjusting your search or filters')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Browse the Template Library' })).toBeNull();
  });

  it('points to the library when there are no runs at all', async () => {
    await openTheRunsWithActions([]);

    expect(screen.getByText('Start a run from one of your templates')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse the Template Library' })).toBeTruthy();
  });

  it('filters by status and by Template, keeping the Template in the URL', async () => {
    await openTheRunsAt('/dashboard/runs/');

    await chooseTheOption('Template', 'Beta Launch');
    expect(navigation.url()).toBe('/dashboard/runs/?template=tpl-b');
    expect(shownRunTitles()).toEqual(['Launch One']);

    await chooseTheOption('Template', 'All templates');
    await chooseTheOption('Status', 'Completed');
    expect(navigation.url()).toBe('/dashboard/runs/');
    expect(screen.getByText('No runs found')).toBeTruthy();
  });

  it('names a Template it cannot find as unknown in the Template filter', async () => {
    await openTheRunsAt('/dashboard/runs/?template=tpl-gone');

    expect(screen.getByRole('combobox', { name: 'Template' }).textContent).toContain('Unknown template');
    expect(screen.getByText('Runs started from Unknown template appear here.')).toBeTruthy();
  });
});
