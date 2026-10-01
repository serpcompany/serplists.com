import type { ResourcePermissions } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

export const getRunRowActions = (
  run: Pick<ChecklistRun, 'isPublic' | 'isStale'>,
  permissions: ResourcePermissions,
) => ({
  canDelete: permissions.canManage,
  canRevalidate: permissions.canRun && Boolean(run.isStale) && !run.isPublic,
  canShare: permissions.canRun,
});
