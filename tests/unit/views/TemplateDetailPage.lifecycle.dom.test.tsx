import { navigation } from '../../support/mockedNextNavigation';
import {
  baseModel,
  chooseFromTheMoreMenu,
  contextDeleteTemplate,
  mockUseTemplateDetailModel,
  openTemplateDetailInTheDom,
  resetTemplateDetailPageMocks,
  userStillOnThePage,
  workspaceState,
} from '../../support/templateDetailPage';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { TemplateDetailActionResult } from '@/features/template-detail/templateDetailApi';
import { handleUpgradeRequiredForContext } from '@/lib/access-flow';
import type { ChecklistTemplate } from '@/types/checklist';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import { pressTheButton } from '../../support/pressTheButton';
import { clickInTheDialog, theDialogsToClose } from '../../support/confirmDialogs';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';

theInMemoryBrowserAsTheWindow();

const startRun = vi.fn<(runName?: string) => Promise<TemplateDetailActionResult>>();
const transferTemplate = vi.fn<(teamId: string) => Promise<TemplateDetailActionResult>>();

beforeEach(() => {
  resetTemplateDetailPageMocks();
  userStillOnThePage.current = true;
  startRun.mockReset();
  transferTemplate.mockReset();
  vi.mocked(handleUpgradeRequiredForContext).mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openTheTemplate = (template: Partial<ChecklistTemplate> = {}, model: Parameters<typeof mockUseTemplateDetailModel.mockReturnValue>[0] = {}) => {
  mockUseTemplateDetailModel.mockReturnValue({
    ...baseModel(),
    startRun,
    transferTemplate,
    template: { ...buildV0DemoPrivateTemplate(), ...template },
    ...model,
  });
  return openTemplateDetailInTheDom();
};

const deleteTheTemplate = async () => {
  await chooseFromTheMoreMenu('Delete');
  await clickInTheDialog(screen.getByRole('alertdialog'), 'Delete');
};

describe('TemplateDetail Delete', () => {
  it('deletes the Template and opens My Templates', async () => {
    contextDeleteTemplate.mockResolvedValue(undefined);
    await openTheTemplate();

    await deleteTheTemplate();

    expect(contextDeleteTemplate).toHaveBeenCalledWith('tpl-1');
    expect(toast.success).toHaveBeenCalledWith('Template deleted');
    expect(navigation.url()).toBe('/dashboard/templates/');
  });

  it('stays where a user who left during the delete now is', async () => {
    contextDeleteTemplate.mockImplementation(async () => {
      userStillOnThePage.current = false;
    });
    await openTheTemplate();

    await deleteTheTemplate();

    expect(toast.success).toHaveBeenCalledWith('Template deleted');
    expect(navigation.url()).toBe('/dashboard/templates/tpl-1/');
  });

  it.each([
    ['the reason the API gives', new Error('Template is in use by a run'), 'Template is in use by a run'],
    ['a plain reason when there is none', 'offline', 'Failed to delete template'],
  ])('keeps the Template and shows %s when the delete fails', async (_case, failure, message) => {
    contextDeleteTemplate.mockRejectedValue(failure);
    await openTheTemplate();

    await deleteTheTemplate();

    expect(toast.error).toHaveBeenCalledWith(message);
    await theDialogsToClose();
    expect(navigation.url()).toBe('/dashboard/templates/tpl-1/');
  });
});

describe('TemplateDetail Start Run past the plan limit', () => {
  it('asks for the upgrade the context needs', async () => {
    startRun.mockResolvedValue({ kind: 'upgrade_required' });
    await openTheTemplate();

    await pressTheButton('Start Run');
    await clickInTheDialog(screen.getByRole('dialog', { name: 'Start a Run' }), 'Start Run');

    expect(handleUpgradeRequiredForContext).toHaveBeenCalledWith({ billingEnabled: true, isTeamWorkspace: false });
  });
});

describe('TemplateDetail Export JSON on Pro', () => {
  const exportTheTemplate = async (template: Partial<ChecklistTemplate> = {}) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:template-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const saved = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await openTheTemplate(template);
    await chooseFromTheMoreMenu('Export JSON');
    return saved;
  };

  it('downloads the Template as JSON', async () => {
    const saved = await exportTheTemplate();

    expect(saved).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Template exported as JSON');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('warns that uploaded files stay out of the export', async () => {
    const upload = { type: 'image' as const, uploadType: 'upload' as const, value: '/api/uploads/file?key=abc' };
    const sections = buildV0DemoPrivateTemplate().sections.map((section, sectionIndex) => ({
      ...section,
      items: section.items.map((item, itemIndex) =>
        sectionIndex === 0 && itemIndex === 0 ? { ...item, contents: [upload] } : item,
      ),
    }));

    await exportTheTemplate({ sections });

    expect(toast.success).toHaveBeenCalledWith('Template exported as JSON');
    expect(toast.warning).toHaveBeenCalledWith('Uploaded files are not included in JSON exports.');
  });
});

describe('TemplateDetail Transfer to Organization', () => {
  it('opens the Template in the Organization it moved to', async () => {
    workspaceState.teams = [{ id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme', role: 'owner' }];
    transferTemplate.mockResolvedValue({ kind: 'ok', templateId: 'tpl-1', teamId: 'team-1' });
    await openTheTemplate({ isPublic: false });

    await chooseFromTheMoreMenu('Transfer to Organization');
    await chooseTheOption('Organization', 'Acme');
    await clickInTheDialog(screen.getByRole('dialog', { name: 'Transfer to Organization' }), 'Transfer');

    expect(transferTemplate).toHaveBeenCalledWith('team-1');
    await waitFor(() =>
      expect(navigation.log).toContainEqual(
        expect.objectContaining({ kind: 'replace', href: '/dashboard/organization/team-1/templates/tpl-1/' }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith('Template transferred to Acme');
  });
});

describe('TemplateDetail details', () => {
  it('shows a recipe with the list icon, and says when it has no categories or tags', async () => {
    const { categories, tags, ...uncategorized } = buildV0DemoPrivateTemplate();
    mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), template: { ...uncategorized, type: 'recipe' } });
    const { container } = await openTemplateDetailInTheDom();

    expect(container.querySelector('svg.lucide-list')).not.toBeNull();
    expect(container.querySelector('svg.lucide-file-text')).toBeNull();
    expect(document.body.textContent).toContain('No categories assigned');
    expect(document.body.textContent).toContain('No tags assigned');
  });
});
