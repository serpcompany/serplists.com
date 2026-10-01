import '../../../support/mockedNextNavigation';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
import { navigation } from '../../../support/nextNavigation';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/alert-dialog', async () => (await import('../../../support/overlaysInPlace')).alertDialogInPlace);
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
vi.mock('@/components/ui/select', async () => (await import('../../../support/overlaysInPlace')).selectWithoutPopup);

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
    navigation.reset('/');
    root?.render(
      <RunsDashboardView runs={[run]} getRunPermissions={() => PERSONAL_PERMISSIONS} onDeleteRun={onDeleteRun} />,
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

describe('RunsDashboardView delete', () => {
  it('names the action Delete and never says it cannot be undone, since the API only archives the run, which /dashboard/archive restores', async () => {
    const onDeleteRun = vi.fn(async () => undefined);
    const container = await renderRuns(onDeleteRun);

    expect(byRole(container, 'menuitem').map((item) => item.textContent)).toContain('Delete');
    expect(byRole(container, 'dialog')).toHaveLength(0);

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });

    const [dialog] = byRole(container, 'dialog');
    expect(dialog).toBeDefined();
    const [title] = findAll(dialog, (node) => node.nodeName === 'H2');
    const [description] = findAll(dialog, (node) => node.nodeName === 'P');
    expect(title?.textContent).toBe('Delete run');
    expect(description?.textContent).toBe('Are you sure you want to delete this run?');
    expect(dialog.textContent).not.toMatch(/cannot be undone|archiv/i);

    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(onDeleteRun).toHaveBeenCalledWith('run-1');
    expect(toast.success).toHaveBeenCalledWith('Run deleted');
    expect(byRole(container, 'dialog')).toHaveLength(0);
  });

  it('says the run could not be deleted when the request fails without a message', async () => {
    const container = await renderRuns(vi.fn(async () => Promise.reject('offline')));

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });
    const [dialog] = byRole(container, 'dialog');
    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to delete run.');
    expect(byRole(container, 'dialog')).toHaveLength(1);
  });

  it('closes the dialog when the run was already deleted elsewhere, as the reloaded list drops it, instead of offering a retry that fails the same way', async () => {
    const error = createApiError(404, { error: 'Checklist not found or unauthorized' });
    const container = await renderRuns(vi.fn(async () => Promise.reject(error)));

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });
    const [dialog] = byRole(container, 'dialog');
    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(toast.error).toHaveBeenCalledWith('Checklist not found or unauthorized');
    expect(byRole(container, 'dialog')).toHaveLength(0);
  });
});
