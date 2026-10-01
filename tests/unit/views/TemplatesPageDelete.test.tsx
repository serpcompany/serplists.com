import { navigation } from '../../support/mockedNextNavigation';
import {
  dashboardTemplates,
  showTheTemplatesModel,
  websiteLaunchTemplate,
} from '../../support/mockedDashboardTemplatesModel';
import {
  clickInTheDialog,
  openAndConfirm,
  openDialogs,
  openTheDeleteDialogWithNoneOpenBefore,
} from '../../support/confirmDialogInPlace';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { toast } from 'sonner';

import { createApiError } from '@/lib/api-errors';
import Templates from '@/views/Templates';


vi.mock('@/components/ui/select', async () => (await import('../../support/overlaysInPlace')).selectWithoutPopup);

dashboardTemplates.viewMode = 'list';

const fakeDom = aFakeDomForEachTest();

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderTemplates(removeTemplate: (id: string) => Promise<void>) {
  showTheTemplatesModel({ templates: [websiteLaunchTemplate({ teamId: 'team-1' })], totalTemplateItems: 1, removeTemplate });
  navigation.reset('/');
  const { container } = await fakeDom.render(<Templates />);
  return container;
}

describe('My Templates delete', () => {
  it('names the action Delete and never says it cannot be undone, since /dashboard/archive can restore what the API archives', async () => {
    const removeTemplate = vi.fn(async () => undefined);
    const container = await renderTemplates(removeTemplate);

    const { dialog, title, description } = await openTheDeleteDialogWithNoneOpenBefore(container);
    expect(dialog).toBeDefined();
    expect(title).toBe('Delete template');
    expect(description).toBe('Are you sure you want to delete this template?');
    expect(dialog.textContent).not.toMatch(/cannot be undone|your library|archiv/i);

    await clickInTheDialog(container, dialog, 'Delete');

    expect(removeTemplate).toHaveBeenCalledWith('template-1');
    expect(toast.success).toHaveBeenCalledWith('Template deleted');
    expect(openDialogs(container)).toHaveLength(0);
  });

  it('says the Template could not be deleted when the request fails without a message', async () => {
    const container = await renderTemplates(vi.fn(async () => Promise.reject('offline')));

    await openAndConfirm(container, 'Delete');

    expect(toast.error).toHaveBeenCalledWith('Failed to delete template.');
    expect(openDialogs(container)).toHaveLength(1);
  });

  it('closes the dialog when the Template was already deleted elsewhere, since the reloaded lists no longer hold it, instead of offering a retry that fails the same way', async () => {
    const error = createApiError(404, { error: 'Template not found or unauthorized' });
    const container = await renderTemplates(vi.fn(async () => Promise.reject(error)));

    await openAndConfirm(container, 'Delete');

    expect(toast.error).toHaveBeenCalledWith('Template not found or unauthorized');
    expect(openDialogs(container)).toHaveLength(0);
  });
});
