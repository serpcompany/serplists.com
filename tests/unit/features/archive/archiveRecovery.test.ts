import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canEditTeamTemplates, canManageTeam, teamRoles } from '@functions/api/utils/team-access';
import {
  canRestoreArchiveItem,
  describeRestoreError,
  getArchiveListState,
  parseArchiveItems,
  restoreArchiveItem,
} from '@/features/archive/archiveRecovery';
import { createApiError } from '@/lib/api-errors';
import { getOrganizationPermissions, PERSONAL_PERMISSIONS } from '@/lib/organizationPermissions';
import { queryKeys } from '@/lib/queryKeys';

const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

const setup = (overrides: { restoreTemplate?: () => Promise<unknown>; restoreRun?: () => Promise<unknown> } = {}) => {
  const queryClient = newClient();
  const dependencies = {
    queryClient,
    pending: new Set<string>(),
    restoreTemplate: vi.fn(overrides.restoreTemplate ?? (async () => ({ success: true }))),
    restoreRun: vi.fn(overrides.restoreRun ?? (async () => ({ success: true }))),
    userId: 'user-1',
    scopeId: 'personal',
  };
  return { queryClient, dependencies };
};

describe('parseArchiveItems', () => {
  it('maps archived rows and skips rows without an id', () => {
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
    expect(dependencies.pending.size).toBe(0);
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
    expect(dependencies.pending.has('run-1')).toBe(false);
  });
});

// POST /api/templates/:id/restore needs canEditTemplate (canEditTeamTemplates in an
// Organization) and POST /api/checklists/:id/restore needs canRestoreRun (canManageTeam).
describe('who may restore', () => {
  it.each(teamRoles)('matches the API restore checks for an Organization %s', (role) => {
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
