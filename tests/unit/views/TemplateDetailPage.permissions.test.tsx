import { beforeEach, describe, expect, it } from 'vitest';

import {
  baseModel,
  hasEditLink,
  hasShareButton,
  isVisibilitySwitchDisabled,
  mockUseTemplateDetailModel,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
  workspaceState,
} from '../../support/templateDetailPage';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

beforeEach(resetTemplateDetailPageMocks);

describe('TemplateDetail Organization permissions', () => {
  beforeEach(() => {
    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
  });

  it('gives a Creator whose role no longer allows editing no edit controls', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), teamId: 'team-1', userId: 'user-1' },
    });

    const html = renderTemplateDetail();

    expect(hasShareButton(html)).toBe(false);
    expect(hasEditLink(html)).toBe(false);
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(isVisibilitySwitchDisabled(html)).toBe(true);
  });

  it('gives an Organization editor who did not create the template Share and Edit', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: { ...buildV0DemoPrivateTemplate(), teamId: 'team-1', userId: 'someone-else' },
    });

    const html = renderTemplateDetail();

    expect(hasShareButton(html)).toBe(true);
    expect(hasEditLink(html)).toBe(true);
    expect(isVisibilitySwitchDisabled(html)).toBe(false);
  });

  it('passes the active role to the model, which guards Share and history with it', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue(baseModel());

    renderTemplateDetail();

    expect(mockUseTemplateDetailModel).toHaveBeenCalledWith(
      expect.objectContaining({ canEditTemplates: false, teamId: 'team-1', userId: 'user-1' }),
    );
  });

  it('gives the Creator of a public Organization template they left the public copy, not owner controls, since the API names no team_id to a non-member', () => {
    workspaceState.activeTeamId = undefined;
    workspaceState.isTeamWorkspace = false;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
      template: {
        ...buildV0DemoPrivateTemplate(),
        isPublic: true,
        ownerType: 'team',
        teamId: undefined,
        userId: 'user-1',
      },
    });

    const html = renderTemplateDetail();

    expect(hasShareButton(html)).toBe(false);
    expect(hasEditLink(html)).toBe(false);
    expect(html).not.toContain('aria-label="Template actions"');
    expect(html).not.toContain('Changelog');
    expect(isVisibilitySwitchDisabled(html)).toBe(true);
    expect(html).toContain('Upgrade to copy template');
  });
});

describe('TemplateDetail copy into an Organization', () => {
  const otherUsersPublicTemplate = () => ({
    ...buildV0DemoPrivateTemplate(),
    isPublic: true,
    userId: 'someone-else',
  });

  beforeEach(() => {
    workspaceState.activeTeamId = 'team-1';
    workspaceState.isTeamWorkspace = true;
  });

  it("offers the copy although the Organization's plan is Free", () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
      template: otherUsersPublicTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Copy to Organization');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).not.toContain('Copy to My Templates');
  });

  it('hides the copy from roles that cannot add Templates to the Organization', () => {
    workspaceState.canEditTemplates = false;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: otherUsersPublicTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Start Run');
  });
});

describe('TemplateDetail copy before the active context is known', () => {
  it.each([true, false])('keeps the copy disabled, whatever the Personal plan (Pro: %s)', (isPro) => {
    workspaceState.isWorkspaceLoading = true;
    workspaceState.workspaceStatus = 'loading';
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro },
      template: { ...buildV0DemoPrivateTemplate(), isPublic: true, userId: 'someone-else' },
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Upgrade to copy template');
    expect(html).not.toContain('Copy to My Templates');
    expect(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Loading\.\.\.<\/button>/.test(html)).toBe(true);
    expect(mockUseTemplateDetailModel).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceStatus: 'loading' }),
    );
  });
});

describe('TemplateDetail copy of a private Organization template, which the API cannot clone', () => {
  const privateOrganizationTemplate = (isPublic = false) => ({
    ...buildV0DemoPrivateTemplate(),
    isPublic,
    teamId: 'team-1',
    userId: 'someone-else',
  });

  it("offers no copy to a member viewing it from Personal, while Start Run follows their runner role in the template's Organization", () => {
    workspaceState.roles = { 'team-1': 'runner' };
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to My Templates');
    expect(html).not.toContain('Upgrade to copy template');
    expect(html).toContain('Start Run');
  });

  it('offers no copy to a Free member, so nobody is sent to checkout for it', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: false },
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Upgrade to copy template');
    expect(html).not.toContain('Copy to My Templates');
  });

  it('offers no copy from another Organization', () => {
    workspaceState.activeTeamId = 'team-2';
    workspaceState.isTeamWorkspace = true;
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(),
    });

    const html = renderTemplateDetail();

    expect(html).not.toContain('Copy to Organization');
  });

  it('keeps the copy once the template is public', () => {
    mockUseTemplateDetailModel.mockReturnValue({
      ...baseModel(),
      template: privateOrganizationTemplate(true),
    });

    const html = renderTemplateDetail();

    expect(html).toContain('Copy to My Templates');
  });
});
