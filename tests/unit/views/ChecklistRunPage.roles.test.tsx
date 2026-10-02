import { describe, expect, it } from 'vitest';

import { renderRunPage, twoTaskRun, workspaceRoles } from '../../support/checklistRunPage';
import type { ChecklistRun } from '@/types/checklist';

describe('ChecklistRunPage Organization roles', () => {
  const organizationRun = (): ChecklistRun => ({ ...twoTaskRun([false, false]), teamId: 'acme' });

  it('renders an Organization run read-only for a viewer, even from the Personal context', async () => {
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

  const renderOrganizationRunWhileTheTeamsRequestFailed = async () => {
    workspaceRoles.roles = {};
    workspaceRoles.teamsUnavailable = true;
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });
    workspaceRoles.teamsUnavailable = false;
    return html;
  };

  it('says the Organizations could not load, with Retry, instead of a silent View only, since the role is unknown rather than viewer', async () => {
    const html = await renderOrganizationRunWhileTheTeamsRequestFailed();

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toMatch(/>Retry</);
    expect(html).not.toContain('Continue in Personal');
    expect(html).not.toContain('View only');
  });

  it('offers no action that could fail until the role is known', async () => {
    const html = await renderOrganizationRunWhileTheTeamsRequestFailed();

    expect(html).not.toContain('Mark Complete');
    expect(html).not.toContain('Rename');
  });

  it('keeps View only, with no error, when the loaded list does not include the Organization', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
  });

  it('shows no error on a Personal run when the teams request failed', async () => {
    workspaceRoles.roles = {};
    workspaceRoles.teamsUnavailable = true;
    const html = await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1' });
    workspaceRoles.teamsUnavailable = false;

    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(html).toContain('Mark Complete');
  });
});
