import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { createApiError } from '@/lib/api-errors';
import Templates from '@/views/Templates';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  installFakeDomGlobals,
  type FakeNode,
} from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// The API's DELETE only archives a Template: /dashboard/archive lists it and restores it.
// My Templates must say so, not that it "cannot be undone" or leaves "your library" (an
// Organization's Template is not in anyone's library). Drives the real page in list view;
// only the page model, toasts and the select and alert dialog portals are faked.

const mockUseDashboardTemplatesModel = vi.fn();

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/dashboard-templates/useDashboardTemplatesModel')>()),
  useDashboardTemplatesModel: (...args: unknown[]) => mockUseDashboardTemplatesModel(...args),
}));
vi.mock('@/hooks/useViewModePreference', () => ({
  useViewModePreference: () => ['list', vi.fn()],
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/alert-dialog', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  type ButtonProps = { children?: ReactNode; disabled?: boolean; onClick?: () => void };
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    AlertDialogAction: ({ children, disabled, onClick }: ButtonProps) => (
      <button disabled={disabled} onClick={onClick} type="button">{children}</button>
    ),
    AlertDialogCancel: ({ children, disabled }: ButtonProps) => (
      <button disabled={disabled} type="button">{children}</button>
    ),
    AlertDialogContent: Pass,
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    AlertDialogFooter: Pass,
    AlertDialogHeader: Pass,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  };
});
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Select: Pass, SelectContent: () => null, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Website Launch Checklist',
  description: 'Complete checklist for launching a new website.',
  type: 'checklist',
  sections: [{ id: 'section-1', title: 'Launch prep', items: [{ id: 'item-1', title: 'Freeze content', description: '', contents: [] }] }],
  userId: 'user-1',
  teamId: 'team-1',
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
  isPublic: true,
  categories: [],
  tags: [],
};

const model = (removeTemplate: (id: string) => Promise<void>) => ({
  templates: [template],
  loading: false,
  isEmpty: false,
  canCreateRun: true,
  canCreateTemplate: true,
  canEditTemplate: true,
  canRunTemplate: true,
  totalTemplateItems: 1,
  selectedTemplate: null,
  selectedTemplateId: '',
  runLauncherOpen: false,
  isCreatingRun: false,
  openCreateTemplate: vi.fn(),
  openRunLauncher: vi.fn(),
  openPublicLibrary: vi.fn(),
  openTemplate: vi.fn(),
  removeTemplate,
  closeRunLauncher: vi.fn(),
  selectRunTemplate: vi.fn(),
  createRunFromTemplate: vi.fn(),
  preferenceOwnerId: 'user-1',
});

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

async function renderTemplates(removeTemplate: (id: string) => Promise<void>) {
  mockUseDashboardTemplatesModel.mockReturnValue(model(removeTemplate));
  const container = createFakeContainer();
  root = createRoot(container as unknown as Element);
  await act(async () => {
    navigation.reset('/');
    root?.render(
      <Templates />,
    );
  });
  return container;
}

const dialogs = (node: FakeNode) =>
  findAll(node, (entry) => entry instanceof FakeElement && entry.getAttribute('role') === 'dialog');

const buttonIn = (node: FakeNode, label: string) => {
  const [button] = findAll(node, (entry) => entry.nodeName === 'BUTTON' && entry.textContent === label);
  if (!button) throw new Error(`No button labelled ${label}`);
  return button;
};

describe('My Templates delete', () => {
  // Users see a delete; the API archives the Template and /dashboard/archive can restore it,
  // so the confirmation must never claim the delete is permanent.
  it('names the action Delete and never says it cannot be undone', async () => {
    const removeTemplate = vi.fn(async () => undefined);
    const container = await renderTemplates(removeTemplate);
    expect(dialogs(container)).toHaveLength(0);

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });

    const [dialog] = dialogs(container);
    expect(dialog).toBeDefined();
    const [title] = findAll(dialog, (node) => node.nodeName === 'H2');
    const [description] = findAll(dialog, (node) => node.nodeName === 'P');
    expect(title?.textContent).toBe('Delete template');
    expect(description?.textContent).toBe('Are you sure you want to delete this template?');
    expect(dialog.textContent).not.toMatch(/cannot be undone|your library|archiv/i);

    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(removeTemplate).toHaveBeenCalledWith('template-1');
    expect(toast.success).toHaveBeenCalledWith('Template deleted');
    expect(dialogs(container)).toHaveLength(0);
  });

  it('says the Template could not be deleted when the request fails without a message', async () => {
    const container = await renderTemplates(vi.fn(async () => Promise.reject('offline')));

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });
    const [dialog] = dialogs(container);
    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to delete template.');
    expect(dialogs(container)).toHaveLength(1);
  });

  // Deleted by a teammate or in another tab: the Template lists reload (deleteTemplate's
  // onError) and it leaves them, so its dialog closes instead of offering a retry that fails
  // the same way.
  it('closes the dialog when the Template was already deleted elsewhere', async () => {
    const error = createApiError(404, { error: 'Template not found or unauthorized' });
    const container = await renderTemplates(vi.fn(async () => Promise.reject(error)));

    await act(async () => {
      click(container, buttonIn(container, 'Delete'));
    });
    const [dialog] = dialogs(container);
    await act(async () => {
      click(container, buttonIn(dialog, 'Delete'));
    });

    expect(toast.error).toHaveBeenCalledWith('Template not found or unauthorized');
    expect(dialogs(container)).toHaveLength(0);
  });
});
