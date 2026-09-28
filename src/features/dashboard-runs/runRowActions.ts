import type { ResourcePermissions } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

// Actions the runs list offers on a run, matching what the API allows the viewer.
export const getRunRowActions = (
  run: Pick<ChecklistRun, 'isPublic' | 'isStale'>,
  permissions: ResourcePermissions,
) => ({
  canDelete: permissions.canManage,
  // A shared snapshot is frozen, so revalidating it always fails.
  canRevalidate: permissions.canRun && Boolean(run.isStale) && !run.isPublic,
  canShare: permissions.canRun,
});
