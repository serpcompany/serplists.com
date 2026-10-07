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
import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { toast } from 'sonner';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { createApiError } from '@/lib/api-errors';
import { PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const display = { wide: false };

theInMemoryBrowserAsTheWindow({
  matchMedia: (query: string) => ({
    matches: display.wide && query === '(min-width: 90rem)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
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
