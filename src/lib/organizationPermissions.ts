// What a member may do in an Organization, so the UI offers only actions the API allows.
// Mirrors functions/api/utils/team-access.ts, which stays the authority;
// tests/unit/lib/organizationPermissions.test.ts keeps the two in step.
export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'runner' | 'viewer';

const roleRank: Record<OrganizationRole, number> = {
  owner: 50,
  admin: 40,
  editor: 30,
  runner: 20,
  viewer: 10,
};

export type ResourcePermissions = {
  // Start, execute, rename, share, and revalidate runs (runner and above).
  canRun: boolean;
  // Create, copy into, edit, and delete Templates (editor and above).
  canEditTemplates: boolean;
  // Delete and restore runs, and manage the Organization (admin and above).
  canManage: boolean;
};

export const PERSONAL_PERMISSIONS: ResourcePermissions = {
  canRun: true,
  canEditTemplates: true,
  canManage: true,
};

const hasRole = (role: OrganizationRole | undefined, minimumRole: OrganizationRole): boolean =>
  role !== undefined && roleRank[role] >= roleRank[minimumRole];

// An unknown role (memberships still loading, removed, or an archived Organization) is
// read-only, so the UI never briefly offers an action that would fail.
export const getOrganizationPermissions = (
  role: OrganizationRole | undefined,
): ResourcePermissions => ({
  canRun: hasRole(role, 'runner'),
  canEditTemplates: hasRole(role, 'editor'),
  canManage: hasRole(role, 'admin'),
});

// A Personal resource (no Organization) belongs to the viewer. An Organization resource
// follows the viewer's role in that Organization, whichever context is active.
export const getResourcePermissions = (
  teamId: string | undefined,
  roleForTeam: (teamId: string) => OrganizationRole | undefined,
): ResourcePermissions =>
  teamId ? getOrganizationPermissions(roleForTeam(teamId)) : PERSONAL_PERMISSIONS;

type TemplateForActions = {
  isPublic: boolean;
  teamId?: string;
  userId: string;
};

export const getTemplateActionPermissions = (params: {
  activeTeamId?: string;
  isRepoTemplate: boolean;
  permissionsFor: (teamId?: string) => ResourcePermissions;
  template: TemplateForActions;
  userId?: string;
}) => {
  const { template } = params;
  const isOwner = Boolean(params.userId) && params.userId === template.userId;
  const activeContext = params.permissionsFor(params.activeTeamId);
  // The API decides edits to an Organization Template by role alone, so a creator who
  // was demoted loses Edit.
  const canEdit = template.teamId
    ? params.permissionsFor(template.teamId).canEditTemplates
    : isOwner;
  // A private Organization Template's runs go to its own Organization from any context
  // (resolveTemplateDestinationTeamId in src/lib/templateDestination.ts), so the role there
  // decides; every other Template runs in the active context.
  const isPrivateOrganizationTemplate = Boolean(template.teamId) && !template.isPublic;
  const canStartRun = isPrivateOrganizationTemplate
    ? params.permissionsFor(template.teamId).canRun
    : activeContext.canRun;
  // Copies land in the active context, and the API clones only public Templates.
  const canCopy = (template.isPublic || params.isRepoTemplate) && activeContext.canEditTemplates;

  return { canCopy, canEdit, canStartRun, isOwner };
};
