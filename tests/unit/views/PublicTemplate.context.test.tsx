import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authState,
  installNavigationWindow,
  lastDialogProps,
  lastViewProps,
  mockCreateBillingCheckout,
  mockToastError,
  mockToastSuccess,
  mockUseTemplateDetailModel,
  mockViewProps,
  publishedClipyTemplate,
  renderPublishedRoute,
  restoreNavigationWindow,
  workspaceState,
} from '../../support/publicTemplatePage';
import { buildConsoleTemplatePath } from '@/lib/routes';
import { navigation } from '../../support/nextNavigation';

beforeAll(installNavigationWindow);
afterAll(restoreNavigationWindow);

const ORGANIZATION_UPGRADE_MESSAGE =
  'This Organization needs a paid plan before using this feature.';

describe('PublicTemplate ownership context', () => {
  beforeEach(() => {
    mockCreateBillingCheckout.mockReset();
    mockCreateBillingCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockUseTemplateDetailModel.mockReset();
    mockViewProps.mockReset();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
    workspaceState.activeTeamId = 'team-1';
    workspaceState.canEditTemplates = true;
    workspaceState.canRunTemplates = true;
    workspaceState.isTeamWorkspace = true;
    workspaceState.isWorkspaceLoading = false;
    workspaceState.retryWorkspace.mockReset();
    workspaceState.selectWorkspace.mockReset();
    workspaceState.workspaceStatus = 'ready';
  });

  it('loads billing, clone and run targets for the active Organization', () => {
    renderPublishedRoute(publishedClipyTemplate);

    expect(mockUseTemplateDetailModel).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', userId: 'user-1' }),
    );
  });

  it('loads the template itself instead of reading the in-memory catalog', () => {
    renderPublishedRoute(publishedClipyTemplate);

    const options = mockUseTemplateDetailModel.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual(
      expect.objectContaining({
        identifier: 'reviewed-clipy-checklist',
        mode: 'public',
        ownerUsername: 'alice',
      }),
    );
    expect(options).not.toHaveProperty('cachedTemplates');
  });

  it('keeps Personal as the context when no Organization is active', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;

    renderPublishedRoute(publishedClipyTemplate);

    const options = mockUseTemplateDetailModel.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toHaveProperty('teamId', undefined);
  });

  it('shows the Organization plan message instead of Personal checkout when a run hits the Organization limit', async () => {
    const startRun = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastDialogProps().onConfirm('Launch run');

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('shows the Organization plan message instead of Personal checkout when Save needs a paid Organization', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(saveTemplate).toHaveBeenCalledTimes(1);
    expect(mockCreateBillingCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('still starts Personal checkout when Personal is active', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const startRun = vi.fn().mockResolvedValue({ kind: 'upgrade_required' });
    renderPublishedRoute(publishedClipyTemplate, { startRun });

    await lastDialogProps().onConfirm('Launch run');

    expect(mockCreateBillingCheckout).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
  });

  it('opens the saved copy so the user lands where it was saved', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(navigation.router.push).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe(buildConsoleTemplatePath('clone-1'));
  });

  it('labels Save as an upgrade for a Free Personal user, never in an Organization', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const personal = renderPublishedRoute(publishedClipyTemplate).html;

    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
    const organization = renderPublishedRoute(publishedClipyTemplate).html;

    expect(personal).toContain('Upgrade to copy template');
    expect(organization).not.toContain('Upgrade to');
    expect(organization).toContain('Copy to Library');
  });

  it('never labels Save as an upgrade when the plan check failed', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const { html } = renderPublishedRoute(publishedClipyTemplate, {
      billingState: { billingEnabled: true, isError: true, isLoading: false, isPro: false },
    });

    expect(html).not.toContain('Upgrade to');
    expect(html).toContain('Copy to Library');
  });

  it('says the copy went to the Organization, as the template detail page does', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(mockToastSuccess).toHaveBeenCalledWith('Template copied to this Organization');
  });

  it('still says the copy was saved to the account in Personal', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    await lastViewProps().onSaveTemplate();

    expect(mockToastSuccess).toHaveBeenCalledWith('Template saved to your account');
  });

  it('never offers Save to an Organization role that cannot add Templates', async () => {
    workspaceState.canEditTemplates = false;
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'error', message: 'Forbidden' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { saveTemplate });

    expect(lastViewProps().canSaveTemplate).toBe(false);
    expect(html).not.toMatch(/>(Save|Copy to Library)</);
    await expect(lastViewProps().onSaveTemplate()).resolves.toBe(false);
    expect(saveTemplate).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('keeps Start Run for a runner, who may start runs but not add Templates', () => {
    workspaceState.canEditTemplates = false;
    workspaceState.canRunTemplates = true;
    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(lastViewProps().canStartRun).toBe(true);
    expect(html).toContain('Start Run');
  });

  it('never offers Start Run to an Organization role that cannot start runs', async () => {
    workspaceState.canEditTemplates = false;
    workspaceState.canRunTemplates = false;
    const startRun = vi.fn().mockResolvedValue({ kind: 'error', message: 'Forbidden' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { startRun });

    expect(lastViewProps().canStartRun).toBe(false);
    expect(html).not.toContain('Start Run');
    await lastViewProps().onStartRun();
    await lastDialogProps().onConfirm('Launch run');
    expect(startRun).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('ignores Start Run and Save until the active Organization is known', async () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = true;
    const startRun = vi.fn().mockResolvedValue({ kind: 'ok', runId: 'run-1' });
    const saveTemplate = vi.fn().mockResolvedValue({ kind: 'ok', templateId: 'clone-1' });
    const { html } = renderPublishedRoute(publishedClipyTemplate, { saveTemplate, startRun });

    await lastViewProps().onStartRun();
    await lastDialogProps().onConfirm('Launch run');
    await lastViewProps().onSaveTemplate();

    expect(startRun).not.toHaveBeenCalled();
    expect(saveTemplate).not.toHaveBeenCalled();
    const actionButtons = html.match(/<button[^>]*>(?:(?!<\/button>).)*(?:Start Run|Save|Copy to Library|Upgrade to)(?:(?!<\/button>).)*<\/button>/g) ?? [];
    expect(actionButtons.length).toBeGreaterThanOrEqual(4);
    for (const button of actionButtons) {
      expect(button).toContain('disabled=""');
    }
  });

  it('offers Retry and Continue in Personal itself when the Organizations failed to load, since the public shell has no Organization gate', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    workspaceState.isWorkspaceLoading = true;
    workspaceState.workspaceStatus = 'error';

    const { html } = renderPublishedRoute(publishedClipyTemplate);

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    const { workspaceError } = lastViewProps();
    workspaceError?.onRetry();
    expect(workspaceState.retryWorkspace).toHaveBeenCalledTimes(1);
    workspaceError?.onContinueInPersonal();
    expect(workspaceState.selectWorkspace).toHaveBeenCalledWith('personal');
  });

  it('shows no Organizations error while they load, or to a signed-out visitor', () => {
    workspaceState.isWorkspaceLoading = true;
    workspaceState.workspaceStatus = 'loading';
    expect(renderPublishedRoute(publishedClipyTemplate).html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(lastViewProps().workspaceError).toBeNull();

    authState.isAuthenticated = false;
    authState.user = null;
    workspaceState.workspaceStatus = 'error';
    expect(renderPublishedRoute(publishedClipyTemplate).html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(lastViewProps().workspaceError).toBeNull();
  });
});
