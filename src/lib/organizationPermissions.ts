export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'runner' | 'viewer';

const roleRank: Record<OrganizationRole, number> = {
  owner: 50,
  admin: 40,
  editor: 30,
  runner: 20,
  viewer: 10,
};

export type ResourcePermissions = {
  canRun: boolean;
  canEditTemplates: boolean;
  canManage: boolean;
};

export const PERSONAL_PERMISSIONS: ResourcePermissions = {
  canRun: true,
  canEditTemplates: true,
  canManage: true,
};

const hasRole = (role: OrganizationRole | undefined, minimumRole: OrganizationRole): boolean =>
  role !== undefined && roleRank[role] >= roleRank[minimumRole];

export const getOrganizationPermissions = (
  role: OrganizationRole | undefined,
): ResourcePermissions => ({
  canRun: hasRole(role, 'runner'),
  canEditTemplates: hasRole(role, 'editor'),
  canManage: hasRole(role, 'admin'),
});

export const getResourcePermissions = (
  teamId: string | undefined,
  roleForTeam: (teamId: string) => OrganizationRole | undefined,
): ResourcePermissions =>
  teamId ? getOrganizationPermissions(roleForTeam(teamId)) : PERSONAL_PERMISSIONS;

type TemplateForActions = {
  isPublic: boolean;
  ownerType?: 'user' | 'team' | undefined;
  teamId?: string | undefined;
  userId: string;
};

export const getTemplateActionPermissions = (params: {
  activeTeamId?: string | undefined;
  isRepoTemplate: boolean;
  permissionsFor: (teamId?: string) => ResourcePermissions;
  template: TemplateForActions;
  userId?: string | undefined;
}) => {
  const { template } = params;
  const isOwner = Boolean(params.userId) && params.userId === template.userId;
  const activeContext = params.permissionsFor(params.activeTeamId);
  const canEdit = template.teamId
    ? params.permissionsFor(template.teamId).canEditTemplates
    : isOwner && template.ownerType !== 'team';
  const isPrivateOrganizationTemplate = Boolean(template.teamId) && !template.isPublic;
  const canStartRun = isPrivateOrganizationTemplate
    ? params.permissionsFor(template.teamId).canRun
    : activeContext.canRun;
  const canCopy = (template.isPublic || params.isRepoTemplate) && activeContext.canEditTemplates;

  return { canCopy, canEdit, canStartRun, isOwner };
};
