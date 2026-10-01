import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { canEditTeamTemplates, canManageTeam, teamRoles } from '@functions/api/utils/team-access';
import {
  canRestoreArchiveItem,
  describeRestoreError,
  getArchiveListState,
  parseArchiveItems,
  restoreArchiveItem,
} from '@/features/archive/archiveRecovery';
import { getTemplateDetailQueryKey } from '@/features/template-detail/templateDetailQuery';
import { createApiError } from '@/lib/api-errors';
import { getOrganizationPermissions, PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import { queryKeys } from '@/lib/queryKeys';

import { queryClientsClearedAfterEachTest } from '../../../support/queryClientsPerTest';

const newClient = queryClientsClearedAfterEachTest();

const setup = (overrides: { restoreTemplate?: () => Promise<unknown>; restoreRun?: () => Promise<unknown> } = {}) => {
  const queryClient = newClient();
  const dependencies = {
    queryClient,
    restoringIds: new Set<string>(),
    restoreTemplate: vi.fn(overrides.restoreTemplate ?? (async () => ({ success: true }))),
    restoreRun: vi.fn(overrides.restoreRun ?? (async () => ({ success: true }))),
    userId: 'user-1',
    scopeId: 'personal',
  };
  return { queryClient, dependencies };
};

describe('parseArchiveItems', () => {
  it('maps archived rows and skips a row without an id, which cannot be restored, instead of failing the whole list', () => {
    expect(
      parseArchiveItems(
        [
          { id: 'template-1', title: 'Launch', deleted_at: '2026-07-03T12:00:00.000Z' },
          { id: 'template-2', title: null, updated_at: '2026-07-02T12:00:00.000Z' },
          { title: 'No id' },
        ],
        'template',
      ),
    ).toEqual([
      { id: 'template-1', kind: 'template', title: 'Launch', archivedAt: '2026-07-03T12:00:00.000Z' },
      { id: 'template-2', kind: 'template', title: 'Untitled template', archivedAt: '2026-07-02T12:00:00.000Z' },
    ]);
  });

  it('rejects a response that is not a list instead of showing an empty archive', () => {
    expect(() => parseArchiveItems({ error: 'boom' }, 'run')).toThrow();
  });
});

describe('restoreArchiveItem', () => {
  it('sends one request when the same item is restored twice before the first finishes', async () => {
    let finish: () => void = () => {};
    const { dependencies } = setup({
      restoreRun: () => new Promise((resolve) => { finish = () => resolve({ success: true }); }),
    });

    const first = restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });
    const second = restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });
    finish();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(dependencies.restoreRun).toHaveBeenCalledTimes(1);
    expect(dependencies.restoringIds.size).toBe(0);
  });

  it('marks the archive and the lists the item returns to as stale', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    queryClient.setQueryData(['templates', 'user-1', 'personal'], []);
    queryClient.setQueryData(['runs', 'user-1', 'personal'], []);

    await restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' });

    expect(dependencies.restoreTemplate).toHaveBeenCalledWith('template-1');
    expect(queryClient.getQueryState(queryKeys.archivedTemplates('user-1', 'personal'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['runs', 'user-1', 'personal'])?.isInvalidated).toBe(true);
  });

  it('passes the server error on and lets the item be restored again', async () => {
    const { dependencies } = setup({
      restoreRun: async () => {
        throw new Error('Active run limit reached. Upgrade to Pro to restore more checklist runs.');
      },
    });

    await expect(restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' })).rejects.toThrow('Active run limit reached');
    expect(dependencies.restoringIds.has('run-1')).toBe(false);
  });
});

describe('restoreArchiveItem when another tab, a teammate or a concurrent request already restored the item, or it is gone', () => {
  const alreadyRestored = (kind: 'Template' | 'Checklist') =>
    createApiError(400, { error: `${kind} is not archived`, code: 'not_archived' });

  const seedLists = (queryClient: QueryClient) => {
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    queryClient.setQueryData(queryKeys.archivedRuns('user-1', 'personal'), []);
    queryClient.setQueryData(['templates', 'user-1', 'personal'], []);
    queryClient.setQueryData(['runs', 'user-1', 'personal'], []);
  };
  const isInvalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated ?? false;
  const restoreRun1FailingWith = async (error: unknown) => {
    const { queryClient, dependencies } = setup({ restoreRun: async () => { throw error; } });
    seedLists(queryClient);

    await expect(restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' })).rejects.toBe(error);
    return { queryClient, dependencies };
  };

  it('refreshes the archived templates and the lists, and forgets the cached gone detail page, when a template was already restored', async () => {
    const error = alreadyRestored('Template');
    const { queryClient, dependencies } = setup({ restoreTemplate: async () => { throw error; } });
    seedLists(queryClient);
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-1'), null);

    await expect(restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' })).rejects.toBe(error);

    expect(isInvalidated(queryClient, queryKeys.archivedTemplates('user-1', 'personal'))).toBe(true);
    expect(isInvalidated(queryClient, ['templates', 'user-1', 'personal'])).toBe(true);
    expect(isInvalidated(queryClient, ['runs', 'user-1', 'personal'])).toBe(true);
    expect(queryClient.getQueryState(getTemplateDetailQueryKey('template-1', 'user-1'))).toBeUndefined();
    expect(dependencies.restoringIds.size).toBe(0);
  });

  it('refreshes the archived runs and the run lists when a run was already restored', async () => {
    const error = alreadyRestored('Checklist');
    const { queryClient, dependencies } = await restoreRun1FailingWith(error);

    expect(isInvalidated(queryClient, queryKeys.archivedRuns('user-1', 'personal'))).toBe(true);
    expect(isInvalidated(queryClient, ['runs', 'user-1', 'personal'])).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.archivedTemplates('user-1', 'personal'))).toBe(false);
    expect(dependencies.restoringIds.size).toBe(0);
  });

  it('refreshes the archive when the item is gone (404)', async () => {
    const error = createApiError(404, { error: 'Checklist not found' });
    const { queryClient } = await restoreRun1FailingWith(error);

    expect(isInvalidated(queryClient, queryKeys.archivedRuns('user-1', 'personal'))).toBe(true);
  });

  it('leaves the lists alone when the item is still archived (a plan limit or a role refusal)', async () => {
    for (const error of [
      createApiError(403, { code: 'limit_reached', error: 'Your plan allows 3 active runs.' }),
      createApiError(403, { error: 'Forbidden' }),
      createApiError(400, { error: 'Checklist ID required' }),
    ]) {
      const { queryClient, dependencies } = await restoreRun1FailingWith(error);

      expect(isInvalidated(queryClient, queryKeys.archivedRuns('user-1', 'personal'))).toBe(false);
      expect(isInvalidated(queryClient, ['runs', 'user-1', 'personal'])).toBe(false);
      expect(dependencies.restoringIds.size).toBe(0);
    }
  });

  it('still reports the restore error when the refresh fails', async () => {
    const error = alreadyRestored('Template');
    const { queryClient, dependencies } = setup({ restoreTemplate: async () => { throw error; } });
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('refresh failed'));

    await expect(restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' })).rejects.toBe(error);
    expect(dependencies.restoringIds.size).toBe(0);
  });
});

describe('restoreArchiveItem and detail pages that a delete from the detail page cached as gone', () => {
  it('forgets that the restored template was gone, so the next visit opens with a spinner instead of Template Not Found', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-1'), null);
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-2'), { id: 'template-1' });
    queryClient.setQueryData(getTemplateDetailQueryKey('template-2', 'user-1'), { id: 'template-2' });

    await restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' });

    expect(queryClient.getQueryState(getTemplateDetailQueryKey('template-1', 'user-1'))).toBeUndefined();
    expect(queryClient.getQueryState(getTemplateDetailQueryKey('template-1', 'user-2'))).toBeUndefined();
    expect(queryClient.getQueryData(getTemplateDetailQueryKey('template-2', 'user-1'))).toEqual({ id: 'template-2' });
  });

  it('forgets a gone page opened by slug too, since neither its key nor its answer can name the template', async () => {
    const { queryClient, dependencies } = setup();
    const goneOpenedBySlug = getTemplateDetailQueryKey('launch-qa', 'user-1');
    queryClient.setQueryData(goneOpenedBySlug, null);
    queryClient.setQueryData(getTemplateDetailQueryKey('template-2', 'user-1'), { id: 'template-2' });

    await restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' });

    expect(queryClient.getQueryState(goneOpenedBySlug)).toBeUndefined();
    expect(queryClient.getQueryData(getTemplateDetailQueryKey('template-2', 'user-1'))).toEqual({ id: 'template-2' });
  });

  it('leaves template detail pages alone when a run is restored', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-1'), null);

    await restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });

    expect(queryClient.getQueryData(getTemplateDetailQueryKey('template-1', 'user-1'))).toBeNull();
  });
});

describe('who may restore', () => {
  it.each(teamRoles)('matches POST /api/templates/:id/restore and POST /api/checklists/:id/restore for an Organization %s', (role) => {
    const permissions = getOrganizationPermissions(role);
    expect(canRestoreArchiveItem(permissions, 'template')).toBe(canEditTeamTemplates(role));
    expect(canRestoreArchiveItem(permissions, 'run')).toBe(canManageTeam(role));
  });

  it('lets the owner restore both in Personal, and nobody while the role is unknown', () => {
    expect(canRestoreArchiveItem(PERSONAL_PERMISSIONS, 'template')).toBe(true);
    expect(canRestoreArchiveItem(PERSONAL_PERMISSIONS, 'run')).toBe(true);
    expect(canRestoreArchiveItem(getOrganizationPermissions(undefined), 'template')).toBe(false);
    expect(canRestoreArchiveItem(getOrganizationPermissions(undefined), 'run')).toBe(false);
  });
});

describe('describeRestoreError', () => {
  it('explains a role refusal (a bare 403) instead of showing "Forbidden"', () => {
    const forbidden = createApiError(403, { error: 'Forbidden' });
    expect(describeRestoreError(forbidden, 'template')).toBe('Your role in this Organization cannot restore templates.');
    expect(describeRestoreError(forbidden, 'run')).toBe('Your role in this Organization cannot restore runs.');
  });

  it("keeps the API's reason for a plan limit and other failures", () => {
    const limit = createApiError(403, { code: 'limit_reached', error: 'Your plan allows 3 active runs.' });
    expect(describeRestoreError(limit, 'run')).toBe('Your plan allows 3 active runs.');
    expect(describeRestoreError(new Error(''), 'template')).toBe('Failed to restore template.');
    expect(describeRestoreError(createApiError(500, {}), 'run')).toBe('HTTP 500');
  });

  it('says an item restored elsewhere, or gone, left the list instead of "is not archived"', () => {
    const template = createApiError(400, { error: 'Template is not archived', code: 'not_archived' });
    const run = createApiError(400, { error: 'Checklist is not archived', code: 'not_archived' });
    expect(describeRestoreError(template, 'template')).toBe('This template was already restored. The list was refreshed.');
    expect(describeRestoreError(run, 'run')).toBe('This run was already restored. The list was refreshed.');
    expect(describeRestoreError(createApiError(404, { error: 'Template not found' }), 'template')).toBe(
      'This template is no longer available. The list was refreshed.',
    );
    expect(describeRestoreError(createApiError(404, { error: 'Checklist not found' }), 'run')).toBe(
      'This run is no longer available. The list was refreshed.',
    );
  });
});

describe('getArchiveListState', () => {
  it('is loading with no data while the query waits disabled, fetches, or retries after a failure', () => {
    expect(getArchiveListState({ data: undefined, isError: false, isFetching: false })).toBe('loading');
    expect(getArchiveListState({ data: undefined, isError: false, isFetching: true })).toBe('loading');
    expect(getArchiveListState({ data: undefined, isError: true, isFetching: true })).toBe('loading');
  });

  it('is an error only once a first load failed and nothing is loading', () => {
    expect(getArchiveListState({ data: undefined, isError: true, isFetching: false })).toBe('error');
  });

  it('keeps a loaded list, even an empty one or one whose refresh failed', () => {
    expect(getArchiveListState({ data: [], isError: false, isFetching: false })).toBe('loaded');
    expect(getArchiveListState({ data: [{ id: 'run-1' }], isError: true, isFetching: false })).toBe('loaded');
    expect(getArchiveListState({ data: [{ id: 'run-1' }], isError: false, isFetching: true })).toBe('loaded');
  });
});
