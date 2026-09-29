import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { createApiError } from '@/lib/api-errors';
import Templates from '@/pages/Templates';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  installFakeDomGlobals,
  type FakeNode,
} from '../../fixtures/fakeDom';

// The API's DELETE only archives a Template: /dashboard/archive lists it and restores it.
// My Templates must say so, not that it "cannot be undone" or leaves "your library" (an
// Organization's Template is not in anyone's library). Drives the real page in list view;
// only the page model, toasts and the Radix select and dialog portals are faked.

const mockUseDashboardTemplatesModel = vi.fn();

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/dashboard-templates/useDashboardTemplatesModel')>()),
  useDashboardTemplatesModel: (...args: unknown[]) => mockUseDashboardTemplatesModel(...args),
}));
vi.mock('@/hooks/useViewModePreference', () => ({
  useViewModePreference: () => ['list', vi.fn()],
}));
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
    root?.render(
      <MemoryRouter>
        <Templates />
      </MemoryRouter>,
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

describe('My Templates archive', () => {
  it('names the action Archive and says where the Template goes, not that it cannot be undone', async () => {
    const removeTemplate = vi.fn(async () => undefined);
    const container = await renderTemplates(removeTemplate);
    expect(dialogs(container)).toHaveLength(0);

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });

    const [dialog] = dialogs(container);
    expect(dialog).toBeDefined();
    const [title] = findAll(dialog, (node) => node.nodeName === 'H2');
    const [description] = findAll(dialog, (node) => node.nodeName === 'P');
    expect(title?.textContent).toBe('Archive template');
    expect(description?.textContent).toContain('moves to Archive');
    expect(description?.textContent).toContain('can be restored');
    expect(dialog.textContent).not.toMatch(/cannot be undone|your library|delete/i);

    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(removeTemplate).toHaveBeenCalledWith('template-1');
    expect(toast.success).toHaveBeenCalledWith('Template archived');
    expect(dialogs(container)).toHaveLength(0);
  });

  it('says the Template could not be archived when the request fails without a message', async () => {
    const container = await renderTemplates(vi.fn(async () => Promise.reject('offline')));

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });
    const [dialog] = dialogs(container);
    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to archive template.');
    expect(dialogs(container)).toHaveLength(1);
  });

  // Archived by a teammate or in another tab: the Template lists reload (deleteTemplate's
  // onError) and it leaves them, so its dialog closes instead of offering a retry that fails
  // the same way.
  it('closes the dialog when the Template was already archived elsewhere', async () => {
    const error = createApiError(404, { error: 'Template not found or unauthorized' });
    const container = await renderTemplates(vi.fn(async () => Promise.reject(error)));

    await act(async () => {
      click(container, buttonIn(container, 'Archive'));
    });
    const [dialog] = dialogs(container);
    await act(async () => {
      click(container, buttonIn(dialog, 'Archive'));
    });

    expect(toast.error).toHaveBeenCalledWith('Template not found or unauthorized');
    expect(dialogs(container)).toHaveLength(0);
  });
});
