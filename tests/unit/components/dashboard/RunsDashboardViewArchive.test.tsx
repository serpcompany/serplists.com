import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { createApiError } from '@/lib/api-errors';
import { PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  installFakeDomGlobals,
  type FakeNode,
} from '../../../fixtures/fakeDom';

// The API's DELETE only archives a run: /dashboard/archive lists it and restores it. The
// runs list must say so, not that the action "cannot be undone". Drives the real view; only
// toasts and the Radix menu, select and dialog portals are faked, so they render in place.

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/dialog', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: Pass,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  };
});
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Pass,
    DropdownMenuItem: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
  };
});
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Select: Pass, SelectContent: () => null, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
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

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
beforeEach(() => {
  vi.clearAllMocks();
});

async function renderRuns(onDeleteRun: (runId: string) => Promise<void>) {
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <RunsDashboardView runs={[run]} getRunPermissions={() => PERSONAL_PERMISSIONS} onDeleteRun={onDeleteRun} />
      </MemoryRouter>,
    );
  });
  return container;
}

const byRole = (node: FakeNode, role: string) =>
  findAll(node, (entry) => entry instanceof FakeElement && entry.getAttribute('role') === role);

const buttonIn = (node: FakeNode, label: string) => {
  const [button] = findAll(node, (entry) => entry.nodeName === 'BUTTON' && entry.textContent === label);
  if (!button) throw new Error(`No button labelled ${label}`);
  return button;
};

describe('RunsDashboardView archive', () => {
  it('names the action Archive and says where the run goes, not that it cannot be undone', async () => {
    const onDeleteRun = vi.fn(async () => undefined);
    const container = await renderRuns(onDeleteRun);

    expect(byRole(container, 'menuitem').map((item) => item.textContent)).toContain('Archive');
    expect(byRole(container, 'dialog')).toHaveLength(0);

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });

    const [dialog] = byRole(container, 'dialog');
    expect(dialog).toBeDefined();
    const [title] = findAll(dialog, (node) => node.nodeName === 'H2');
    const [description] = findAll(dialog, (node) => node.nodeName === 'P');
    expect(title?.textContent).toBe('Archive run');
    expect(description?.textContent).toContain('moves to Archive');
    expect(description?.textContent).toContain('can be restored');
    expect(dialog.textContent).not.toMatch(/cannot be undone|delete/i);

    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(onDeleteRun).toHaveBeenCalledWith('run-1');
    expect(toast.success).toHaveBeenCalledWith('Run archived');
    expect(byRole(container, 'dialog')).toHaveLength(0);
  });

  it('says the run could not be archived when the request fails without a message', async () => {
    const container = await renderRuns(vi.fn(async () => Promise.reject('offline')));

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });
    const [dialog] = byRole(container, 'dialog');
    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to archive run.');
    expect(byRole(container, 'dialog')).toHaveLength(1);
  });

  // Archived in another tab: the runs list reloads (deleteRun's onError) and the run leaves
  // it, so the dialog for it closes instead of offering a retry that fails the same way.
  it('closes the dialog when the run was already archived elsewhere', async () => {
    const error = createApiError(404, { error: 'Checklist not found or unauthorized' });
    const container = await renderRuns(vi.fn(async () => Promise.reject(error)));

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });
    const [dialog] = byRole(container, 'dialog');
    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(toast.error).toHaveBeenCalledWith('Checklist not found or unauthorized');
    expect(byRole(container, 'dialog')).toHaveLength(0);
  });
});
