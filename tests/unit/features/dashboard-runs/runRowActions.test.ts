import { describe, expect, it } from 'vitest';

import { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import { getOrganizationPermissions, PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';

const staleRun = {
  id: 'run-1',
  isPublic: false,
  isStale: true,
  status: 'completed',
} as ChecklistRun;

describe('getRunRowActions', () => {
  it('offers everything on a Personal run', () => {
    expect(getRunRowActions(staleRun, PERSONAL_PERMISSIONS)).toEqual({ canDelete: true, canRevalidate: true, canShare: true });
  });

  it('gives an Organization viewer no actions', () => {
    expect(getRunRowActions(staleRun, getOrganizationPermissions('viewer'))).toEqual({
      canDelete: false,
      canRevalidate: false,
      canShare: false,
    });
  });

  it('lets runners and editors share and revalidate but not delete', () => {
    for (const role of ['runner', 'editor'] as const) {
      expect(getRunRowActions(staleRun, getOrganizationPermissions(role))).toEqual({
        canDelete: false,
        canRevalidate: true,
        canShare: true,
      });
    }
  });

  it('lets admins delete Organization runs', () => {
    expect(getRunRowActions(staleRun, getOrganizationPermissions('admin')).canDelete).toBe(true);
  });

  it('never offers to revalidate a shared snapshot or a current run', () => {
    expect(getRunRowActions({ ...staleRun, isPublic: true }, PERSONAL_PERMISSIONS).canRevalidate).toBe(false);
    expect(getRunRowActions({ ...staleRun, isStale: false }, PERSONAL_PERMISSIONS).canRevalidate).toBe(false);
  });
});
