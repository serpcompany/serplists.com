import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { toast } from 'sonner';

import { createApiError } from '@/lib/api-errors';
import Templates from '@/views/Templates';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  type FakeNode,
} from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

const mockUseDashboardTemplatesModel = vi.fn();

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/dashboard-templates/useDashboardTemplatesModel')>()),
  useDashboardTemplatesModel: (...args: unknown[]) => mockUseDashboardTemplatesModel(...args),
}));
vi.mock('@/hooks/useViewModePreference', () => ({
  useViewModePreference: () => ['list', vi.fn()],
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/alert-dialog', async () => (await import('../../support/overlaysInPlace')).alertDialogInPlace);
vi.mock('@/components/ui/select', async () => (await import('../../support/overlaysInPlace')).selectWithoutPopup);

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

const fakeDom = aFakeDomForEachTest();

let root: Root | null = null;
beforeEach(() => {
  vi.clearAllMocks();
});

async function renderTemplates(removeTemplate: (id: string) => Promise<void>) {
  mockUseDashboardTemplatesModel.mockReturnValue(model(removeTemplate));
  const container = createFakeContainer();
  root = fakeDom.track(createRoot(container as unknown as Element));
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
  it('names the action Delete and never says it cannot be undone, since /dashboard/archive can restore what the API archives', async () => {
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

  it('closes the dialog when the Template was already deleted elsewhere, since the reloaded lists no longer hold it, instead of offering a retry that fails the same way', async () => {
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
