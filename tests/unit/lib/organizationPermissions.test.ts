import { describe, expect, it } from 'vitest';

import {
  canEditTeamTemplates,
  canManageTeam,
  canRunTeamTemplates,
  teamRoles,
} from '@functions/api/utils/team-access';
import {
  getOrganizationPermissions,
  getResourcePermissions,
  getTemplateActionPermissions,
  PERSONAL_PERMISSIONS,
  type OrganizationRole,
  type ResourcePermissions,
} from '@/lib/organizationPermissions';

describe('organization permissions', () => {
  it.each(teamRoles)('matches the API role checks for %s', (role) => {
    expect(getOrganizationPermissions(role)).toEqual({
      canRun: canRunTeamTemplates(role),
      canEditTemplates: canEditTeamTemplates(role),
      canManage: canManageTeam(role),
    });
  });

  it('gives a viewer read-only access and a runner run access only', () => {
    expect(getOrganizationPermissions('viewer')).toEqual({ canRun: false, canEditTemplates: false, canManage: false });
    expect(getOrganizationPermissions('runner')).toEqual({ canRun: true, canEditTemplates: false, canManage: false });
    expect(getOrganizationPermissions('editor')).toEqual({ canRun: true, canEditTemplates: true, canManage: false });
  });

  it('treats an unknown role (loading, removed, archived) as read-only', () => {
    expect(getOrganizationPermissions(undefined)).toEqual({ canRun: false, canEditTemplates: false, canManage: false });
  });

  it('uses the resource Organization role, and full rights for Personal resources', () => {
    const roles: Record<string, OrganizationRole> = { acme: 'viewer', beta: 'admin' };
    const roleFor = (teamId: string) => roles[teamId];

    expect(getResourcePermissions(undefined, roleFor)).toEqual(PERSONAL_PERMISSIONS);
    expect(getResourcePermissions('acme', roleFor).canRun).toBe(false);
    expect(getResourcePermissions('beta', roleFor).canManage).toBe(true);
    expect(getResourcePermissions('not-a-member', roleFor).canRun).toBe(false);
  });
});

describe('getTemplateActionPermissions', () => {
  const roles: Record<string, OrganizationRole> = { acme: 'viewer', beta: 'runner', gamma: 'editor' };
  const permissionsFor = (teamId?: string): ResourcePermissions =>
    getResourcePermissions(teamId, (id) => roles[id]);
  const template = (overrides: Partial<{ isPublic: boolean; teamId: string; userId: string }> = {}) => ({
    isPublic: false,
    userId: 'user-1',
    ...overrides,
  });

  it('lets a viewer do nothing with a private Organization Template', () => {
    expect(
      getTemplateActionPermissions({
        activeTeamId: 'acme',
        isRepoTemplate: false,
        permissionsFor,
        template: template({ teamId: 'acme', userId: 'someone-else' }),
        userId: 'user-1',
      }),
    ).toEqual({ canCopy: false, canEdit: false, canStartRun: false, isOwner: false });
  });

  it('takes Edit away from a creator who was demoted in the Organization', () => {
    const permissions = getTemplateActionPermissions({
      activeTeamId: 'acme',
      isRepoTemplate: false,
      permissionsFor,
      template: template({ teamId: 'acme', userId: 'user-1' }),
      userId: 'user-1',
    });

    expect(permissions.isOwner).toBe(true);
    expect(permissions.canEdit).toBe(false);
  });

  it('lets a runner start runs of the Organization Template but not copy or edit it', () => {
    expect(
      getTemplateActionPermissions({
        activeTeamId: 'beta',
        isRepoTemplate: false,
        permissionsFor,
        template: template({ teamId: 'beta', userId: 'someone-else' }),
        userId: 'user-1',
      }),
    ).toEqual({ canCopy: false, canEdit: false, canStartRun: true, isOwner: false });
  });

  it('runs a private Organization Template only from its own Organization or Personal', () => {
    const base = { isRepoTemplate: false, permissionsFor, template: template({ teamId: 'beta' }), userId: 'user-1' };

    expect(getTemplateActionPermissions({ ...base, activeTeamId: undefined }).canStartRun).toBe(true);
    expect(getTemplateActionPermissions({ ...base, activeTeamId: 'gamma' }).canStartRun).toBe(false);
  });

  it('runs and copies public Templates in the active context', () => {
    const base = { isRepoTemplate: false, permissionsFor, template: template({ isPublic: true, userId: 'someone-else' }), userId: 'user-1' };

    expect(getTemplateActionPermissions({ ...base, activeTeamId: undefined })).toMatchObject({ canCopy: true, canStartRun: true });
    expect(getTemplateActionPermissions({ ...base, activeTeamId: 'acme' })).toMatchObject({ canCopy: false, canStartRun: false });
    expect(getTemplateActionPermissions({ ...base, activeTeamId: 'beta' })).toMatchObject({ canCopy: false, canStartRun: true });
    expect(getTemplateActionPermissions({ ...base, activeTeamId: 'gamma' })).toMatchObject({ canCopy: true, canStartRun: true });
  });

  it('never offers to copy a private Template, which the API cannot clone', () => {
    expect(
      getTemplateActionPermissions({
        activeTeamId: undefined,
        isRepoTemplate: false,
        permissionsFor,
        template: template({ teamId: 'acme', userId: 'someone-else' }),
        userId: 'user-1',
      }).canCopy,
    ).toBe(false);
    expect(
      getTemplateActionPermissions({
        activeTeamId: undefined,
        isRepoTemplate: true,
        permissionsFor,
        template: template({ userId: '' }),
        userId: 'user-1',
      }).canCopy,
    ).toBe(true);
  });

  it('keeps full rights on the user own Personal Template', () => {
    expect(
      getTemplateActionPermissions({
        activeTeamId: undefined,
        isRepoTemplate: false,
        permissionsFor,
        template: template(),
        userId: 'user-1',
      }),
    ).toMatchObject({ canEdit: true, canStartRun: true, isOwner: true });
  });
});
