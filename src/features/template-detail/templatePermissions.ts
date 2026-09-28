import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

export type TemplateDetailPermissions = {
  // Duplicate creates the copy in the active context, so that context must allow it.
  canDuplicate: boolean;
  // Edit, Export, Archive and the visibility switch.
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

/**
 * What the viewer may do on the template detail page. An Organization's Template is
 * governed by the viewer's role in that Organization, never by who created it
 * (PRODUCT_SENSE: Creator attribution does not determine current ownership), which is
 * how the API decides too. The page knows the role only for the active Organization, so
 * that Organization's Templates are read-only from any other context.
 */
export const getTemplateDetailPermissions = (params: {
  activeTeamId: string | undefined;
  // The viewer's role in the active context allows editing Templates (true in Personal).
  canEditTemplates: boolean;
  template: Pick<ChecklistTemplate, 'id' | 'teamId' | 'userId'> | null;
  userId: string | undefined;
}): TemplateDetailPermissions => {
  const { template, userId } = params;

  if (!template || !userId || isRepoTemplate(template)) {
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

  const isOwner = template.userId === userId;
  return {
    canDuplicate: isOwner && params.canEditTemplates,
    canEdit: isOwner,
    canShare: isOwner,
    canViewHistory: isOwner,
  };
};

/**
 * Whether another owner's template can be copied. The API clones only public templates
 * (and library templates are copied from the bundle), so the copy button and the copy
 * action both check this: a copy of a private Organization Template could only fail.
 */
export const canCopyTemplate = (
  template: Pick<ChecklistTemplate, 'id' | 'isPublic' | 'userId'> | null,
): boolean => Boolean(template && (isRepoTemplate(template) || template.isPublic));
