import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import { isPersonalTemplateOf } from '@/lib/templates/templateOwnership';
import type { ChecklistTemplate } from '@/types/checklist';

export type TemplateDetailPermissions = {
  canDuplicate: boolean;
  canEdit: boolean;
  canShare: boolean;
  canViewHistory: boolean;
};

const NO_PERMISSIONS: TemplateDetailPermissions = {
  canDuplicate: false,
  canEdit: false,
  canShare: false,
  canViewHistory: false,
};

export const getTemplateDetailPermissions = (params: {
  activeTeamId: string | undefined;
  canEditTemplates: boolean;
  template: Pick<ChecklistTemplate, 'id' | 'ownerType' | 'teamId' | 'userId'> | null;
  userId: string | undefined;
}): TemplateDetailPermissions => {
  const { template, userId } = params;

  if (!template || !userId || isRepoTemplate(template)) {
    return NO_PERMISSIONS;
  }

  if (template.ownerType === 'team' && !template.teamId) {
    return NO_PERMISSIONS;
  }

  if (template.teamId) {
    const isActiveOrganization = params.activeTeamId === template.teamId;
    const canEdit = isActiveOrganization && params.canEditTemplates;
    return {
      canDuplicate: canEdit,
      canEdit,
      canShare: canEdit,
      canViewHistory: isActiveOrganization,
    };
  }

  const isOwner = isPersonalTemplateOf(template, userId);
  return {
    canDuplicate: isOwner && params.canEditTemplates,
    canEdit: isOwner,
    canShare: isOwner,
    canViewHistory: isOwner,
  };
};

export const canCopyTemplate = (
  template: Pick<ChecklistTemplate, 'id' | 'isPublic' | 'userId'> | null,
): boolean => Boolean(template && (isRepoTemplate(template) || template.isPublic));
