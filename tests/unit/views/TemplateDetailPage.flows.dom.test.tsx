import { navigation } from '../../support/mockedNextNavigation';
import {
  authState,
  baseModel,
  chooseFromTheMoreMenu,
  mockUseTemplateDetailModel,
  openTemplateDetailInTheDom,
  resetTemplateDetailPageMocks,
  userStillOnThePage,
  visibilitySwitchProps,
  workspaceState,
} from '../../support/templateDetailPage';
import { act } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type { TemplateDetailActionResult } from '@/features/template-detail/templateDetailApi';
import { handleUpgradeRequiredForContext, navigateToLoginWithReturnPath } from '@/lib/access-flow';
import type { ChecklistTemplate } from '@/types/checklist';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import { deferred } from '../../support/deferred';
import { pressTheButton } from '../../support/pressTheButton';
import { handlerIn } from '../../support/elementTree';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

const shareTemplate = vi.fn<() => Promise<TemplateDetailActionResult>>();
const saveTemplate = vi.fn<() => Promise<TemplateDetailActionResult>>();
const setVisibility = vi.fn<(isPublic: boolean) => Promise<TemplateDetailActionResult>>();

beforeEach(() => {
  resetTemplateDetailPageMocks();
  userStillOnThePage.current = true;
  shareTemplate.mockReset();
  saveTemplate.mockReset();
  setVisibility.mockReset();
  vi.mocked(handleUpgradeRequiredForContext).mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => cleanup());

const openTheTemplate = (template: Partial<ChecklistTemplate> = {}) => {
  mockUseTemplateDetailModel.mockReturnValue({
    ...baseModel(),
    saveTemplate,
    setVisibility,
    shareTemplate,
    template: { ...buildV0DemoPrivateTemplate(), ...template },
  });
  return openTemplateDetailInTheDom();
};

describe('TemplateDetail Share', () => {
  it('shows the public link once the Template is shared', async () => {
    shareTemplate.mockResolvedValue({ kind: 'ok', shareUrl: 'https://serplists.com/profile/designops/product-launch-checklist/' });
    await openTheTemplate();

    await pressTheButton('Share');

    const dialog = screen.getByRole('dialog', { name: 'Share Template' });
    expect(dialog.querySelector('input')?.value).toBe('https://serplists.com/profile/designops/product-launch-checklist/');
  });

  it('says the link could not be made when sharing returns none', async () => {
    shareTemplate.mockResolvedValue({ kind: 'ok' });
    await openTheTemplate();

    await pressTheButton('Share');

    expect(toast.error).toHaveBeenCalledWith('Failed to create a share link for this template.');
    expect(screen.queryByRole('dialog', { name: 'Share Template' })).toBeNull();
  });

  it('sends an expired session to sign in', async () => {
    shareTemplate.mockResolvedValue({ kind: 'login_required' });
    await openTheTemplate();

    await pressTheButton('Share');

    expect(navigateToLoginWithReturnPath).toHaveBeenCalledTimes(1);
  });

  it('asks for the upgrade the context needs when sharing is past the plan', async () => {
    shareTemplate.mockResolvedValue({ kind: 'upgrade_required' });
    await openTheTemplate();

    await pressTheButton('Share');

    expect(handleUpgradeRequiredForContext).toHaveBeenCalledWith({ billingEnabled: true, isTeamWorkspace: false });
  });
});

describe('TemplateDetail copy of a Template the user cannot edit', () => {
  const someoneElses = { userId: 'user-9', ownerProfile: { username: 'alice' } };

  it('copies it to the account and opens the copy', async () => {
    saveTemplate.mockResolvedValue({ kind: 'ok', templateId: 'tpl-copy' });
    await openTheTemplate(someoneElses);

    await pressTheButton('Copy to My Templates');

    expect(saveTemplate).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Template copied to your account');
    expect(navigation.url()).toBe('/dashboard/templates/tpl-copy/');
  });

  it('copies it to the Organization the user works in', async () => {
    Object.assign(workspaceState, { activeTeamId: 'team-1', isTeamWorkspace: true });
    saveTemplate.mockResolvedValue({ kind: 'ok', templateId: 'tpl-copy', teamId: 'team-1' });
    await openTheTemplate({ ...someoneElses, isPublic: true });

    await pressTheButton('Copy to Organization');

    expect(toast.success).toHaveBeenCalledWith('Template copied to this Organization');
  });
});

describe('TemplateDetail visibility switch', () => {
  const visibilitySwitch = () => screen.getByRole('switch');

  const flipTheSwitch = (isPublic: boolean) =>
    act(async () => {
      await handlerIn(visibilitySwitchProps.at(-1), 'onCheckedChange')(isPublic);
    });

  it.each([
    [false, 'Template is now private'],
    [true, 'Template is now public'],
  ])('says the Template is now %s', async (isPublic, message) => {
    setVisibility.mockResolvedValue({ kind: 'ok' });
    await openTheTemplate({ isPublic: !isPublic });

    await flipTheSwitch(isPublic);

    expect(toast.success).toHaveBeenCalledWith(message);
  });

  it('shows why the change failed, or a plain reason when there is none', async () => {
    setVisibility
      .mockResolvedValueOnce({ kind: 'error', message: 'Template is in use' })
      .mockResolvedValueOnce({ kind: 'upgrade_required' });
    await openTheTemplate();

    await flipTheSwitch(false);
    await flipTheSwitch(false);

    expect(vi.mocked(toast.error).mock.calls).toEqual([['Template is in use'], ['Failed to update template visibility']]);
  });

  it('cannot be flipped again while a change is still saving', async () => {
    const saved = deferred<TemplateDetailActionResult>();
    setVisibility.mockReturnValue(saved.promise);
    await openTheTemplate({ isPublic: false });
    expect(visibilitySwitch().hasAttribute('disabled')).toBe(false);

    let flipped: unknown;
    await act(async () => {
      flipped = handlerIn(visibilitySwitchProps.at(-1), 'onCheckedChange')(true);
    });

    expect(visibilitySwitch().hasAttribute('disabled')).toBe(true);
    await act(async () => {
      saved.resolve({ kind: 'ok' });
      await flipped;
    });
    expect(visibilitySwitch().hasAttribute('disabled')).toBe(false);
  });

  it('cannot be flipped by a user who cannot edit the Template', async () => {
    await openTheTemplate({ userId: 'user-9', ownerProfile: { username: 'alice' } });

    expect(visibilitySwitch().hasAttribute('disabled')).toBe(true);
  });
});

describe('TemplateDetail for a visitor who is not signed in', () => {
  it('offers sign in to copy and Start Run, but no runs to view', async () => {
    authState.user = null;
    await openTheTemplate({ userId: 'user-9', ownerProfile: { username: 'alice' } });

    expect(screen.getByRole('link', { name: 'Log in to copy template' }).getAttribute('href')).toBe(
      '/login/?next=%2Fdashboard%2Ftemplates%2Ftpl-1%2F',
    );
    expect(screen.getByRole('button', { name: 'Start Run' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'View runs' })).toBeNull();
  });
});

describe('TemplateDetail Export JSON', () => {
  it('asks for the upgrade on a Free plan', async () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
    });
    await openTemplateDetailInTheDom();

    await chooseFromTheMoreMenu('Upgrade to export');

    expect(handleUpgradeRequiredForContext).toHaveBeenCalledWith({ billingEnabled: true, isTeamWorkspace: false });
  });
});
