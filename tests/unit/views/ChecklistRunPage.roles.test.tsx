import { describe, expect, it } from 'vitest';

import { renderRunPage, twoTaskRun, workspaceRoles } from '../../support/checklistRunPage';
import type { ChecklistRun } from '@/types/checklist';

describe('ChecklistRunPage Organization roles', () => {
  const organizationRun = (): ChecklistRun => ({ ...twoTaskRun([false, false]), teamId: 'acme' });

  it("shows none of an Organization run at a Personal URL, which it leaves for the Organization's", async () => {
    workspaceRoles.roles = { acme: 'runner' };
    const html = await renderRunPage(organizationRun(), { at: '/dashboard/runs/run-1/', selectedItemId: 'item-1' });

    expect(html).toContain('data-dashboard-loading-state="true"');
    expect(html).not.toContain('Website Launch Checklist');
    expect(html).not.toContain('Mark Complete');
  });

  it('renders an Organization run read-only for a viewer', async () => {
    workspaceRoles.roles = { acme: 'viewer' };
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Mark Complete');
    expect(html).not.toContain('Rename');
    expect(html).not.toMatch(/>Share</);
    expect(html).not.toContain('Save notes');
    expect(html).toContain('readOnly=""');
  });

  it('treats a run of an Organization the user is not (yet) known to belong to as read-only', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Mark Complete');
  });

  it('lets a runner execute, rename and share the Organization run', async () => {
    workspaceRoles.roles = { acme: 'runner' };
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('Mark Complete');
    expect(html).toContain('Rename');
    expect(html).toMatch(/>Share</);
    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });

  it('keeps the shared run editable for guests: the share link governs it, not roles', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });
});
