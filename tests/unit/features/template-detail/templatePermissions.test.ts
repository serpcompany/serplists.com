import { describe, expect, it } from 'vitest';

import { getTemplateDetailPermissions } from '@/features/template-detail/templatePermissions';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';

const organizationTemplate = { id: 'template-t', teamId: 'team-1', userId: 'alice' };
const personalTemplate = { id: 'template-p', userId: 'alice' };

describe('getTemplateDetailPermissions', () => {
  it("follows the viewer's role in the Organization, never who created the template", () => {
    for (const userId of ['alice', 'bob']) {
      expect(
        getTemplateDetailPermissions({
          activeTeamId: 'team-1',
          canEditTemplates: false,
          template: organizationTemplate,
          userId,
        }),
      ).toEqual({ canDuplicate: false, canEdit: false, canShare: false, canViewHistory: true });

      expect(
        getTemplateDetailPermissions({
          activeTeamId: 'team-1',
          canEditTemplates: true,
          template: organizationTemplate,
          userId,
        }),
      ).toEqual({ canDuplicate: true, canEdit: true, canShare: true, canViewHistory: true });
    }
  });

  it('keeps an Organization template read-only outside that Organization, even for its Creator', () => {
    for (const activeTeamId of [undefined, 'team-2']) {
      expect(
        getTemplateDetailPermissions({
          activeTeamId,
          canEditTemplates: true,
          template: organizationTemplate,
          userId: 'alice',
        }),
      ).toEqual({ canDuplicate: false, canEdit: false, canShare: false, canViewHistory: false });
    }
  });

  it('lets only the owner manage a Personal template', () => {
    expect(
      getTemplateDetailPermissions({
        activeTeamId: undefined,
        canEditTemplates: true,
        template: personalTemplate,
        userId: 'alice',
      }),
    ).toEqual({ canDuplicate: true, canEdit: true, canShare: true, canViewHistory: true });

    expect(
      getTemplateDetailPermissions({
        activeTeamId: undefined,
        canEditTemplates: true,
        template: personalTemplate,
        userId: 'bob',
      }),
    ).toEqual({ canDuplicate: false, canEdit: false, canShare: false, canViewHistory: false });
  });

  it('duplicates only where the active context lets the viewer add templates', () => {
    expect(
      getTemplateDetailPermissions({
        activeTeamId: 'team-1',
        canEditTemplates: false,
        template: personalTemplate,
        userId: 'alice',
      }),
    ).toEqual({ canDuplicate: false, canEdit: true, canShare: true, canViewHistory: true });
  });

  it('never grants anything for library templates, signed-out viewers or a missing template', () => {
    const none = { canDuplicate: false, canEdit: false, canShare: false, canViewHistory: false };

    expect(
      getTemplateDetailPermissions({
        activeTeamId: undefined,
        canEditTemplates: true,
        template: { id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID },
        userId: REPO_TEMPLATE_USER_ID,
      }),
    ).toEqual(none);
    expect(
      getTemplateDetailPermissions({
        activeTeamId: undefined,
        canEditTemplates: true,
        template: { ...personalTemplate, userId: '' },
        userId: undefined,
      }),
    ).toEqual(none);
    expect(
      getTemplateDetailPermissions({
        activeTeamId: undefined,
        canEditTemplates: true,
        template: null,
        userId: 'alice',
      }),
    ).toEqual(none);
  });
});
