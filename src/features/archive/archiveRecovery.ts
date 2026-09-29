import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import type { ResourcePermissions } from '@/lib/organizationPermissions';
import { queryKeys } from '@/lib/queryKeys';
import { isTemplateDetailOf, isTemplateDetailQuery } from '@/lib/queryCache';
import { refreshRunLists } from '@/contexts/templateListCache';

// Detail pages no one is viewing that remember the restored template as gone (or hold it
// from before the archive). Removed, the next visit loads it with a spinner instead of
// showing "not found" first. A gone answer holds no id, and a page opened by slug has no
// id in its key, so every unviewed gone answer goes.
const forgetRestoredTemplate = (queryClient: QueryClient, templateId: string): void => {
  queryClient.removeQueries({
    predicate: (query) =>
      query.getObserversCount() === 0 &&
      (isTemplateDetailOf(query, templateId) ||
        (isTemplateDetailQuery(query) && query.state.data === null)),
  });
};

export type ArchiveKind = 'template' | 'run';

export type ArchiveItem = {
  id: string;
  kind: ArchiveKind;
  title: string;
  archivedAt: string;
};

const archiveRowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string().nullish(),
    deleted_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .passthrough();

// Rows come from GET /api/templates/archived and /api/checklists/archived. A row without an
// id cannot be restored, so it is skipped rather than failing the whole list.
export function parseArchiveItems(rows: unknown, kind: ArchiveKind): ArchiveItem[] {
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected archived ${kind} list response`);
  }

  return rows.flatMap((row) => {
    const parsed = archiveRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const { id, title, deleted_at: deletedAt, updated_at: updatedAt } = parsed.data;
    return [{
      id: String(id),
      kind,
      title: title || (kind === 'template' ? 'Untitled template' : 'Untitled run'),
      archivedAt: deletedAt || updatedAt || '',
    }];
  });
}

// What an archive list shows. A list with no data is loading until its request fails: while
// the user or the Organizations load, the query waits disabled (React Query v5 then reports
// isLoading false), then comes its first request, and a Retry loads again. A failed refresh
// keeps the last loaded list. Only a loaded list may read as empty.
export type ArchiveListState = 'loading' | 'error' | 'loaded';

export const getArchiveListState = (query: {
  data: readonly unknown[] | undefined;
  isError: boolean;
  isFetching: boolean;
}): ArchiveListState => {
  if (query.data !== undefined) return 'loaded';
  return query.isError && !query.isFetching ? 'error' : 'loading';
};

// The API restores a Template for those who may edit it (editor and above in an
// Organization, canEditTemplate) and a Run for admins and above (canRestoreRun). In Personal
// the owner may restore both. Every archived row belongs to the active context.
export const canRestoreArchiveItem = (permissions: ResourcePermissions, kind: ArchiveKind): boolean =>
  kind === 'template' ? permissions.canEditTemplates : permissions.canManage;

// The item left the archive since the list loaded: another tab, a teammate or a concurrent
// request restored it (not_archived), or it is gone or out of reach (404). Plan-limit and
// role refusals leave it archived, so they are not stale.
const isNoLongerArchivedError = (error: unknown): boolean =>
  isApiError(error) && (error.code === 'not_archived' || error.status === 404);

// Plan limits come back as a 403 with a code and the reason in the message. A 403 without a
// code is a role refusal (the role changed since the page loaded), whose message is only
// "Forbidden".
export function describeRestoreError(error: unknown, kind: ArchiveKind): string {
  if (isApiError(error) && error.code === 'not_archived') {
    return kind === 'template'
      ? 'This template was already restored. The list was refreshed.'
      : 'This run was already restored. The list was refreshed.';
  }
  if (isApiError(error) && error.status === 404) {
    return kind === 'template'
      ? 'This template is no longer available. The list was refreshed.'
      : 'This run is no longer available. The list was refreshed.';
  }
  if (isApiError(error) && error.status === 403 && !error.code) {
    return kind === 'template'
      ? 'Your role in this Organization cannot restore templates.'
      : 'Your role in this Organization cannot restore runs.';
  }
  return getApiErrorMessage(error, kind === 'template' ? 'Failed to restore template.' : 'Failed to restore run.');
}

type RestoreDependencies = {
  queryClient: QueryClient;
  // Ids with a restore in flight. Shared across calls so a double click sends one request.
  pending: Set<string>;
  restoreTemplate: (id: string) => Promise<unknown>;
  restoreRun: (id: string) => Promise<unknown>;
  userId: string | undefined;
  scopeId: string;
};

// Refreshes the archive list the item left and the lists it returns to. Uses the user and
// context the restore started in, so a context switch mid-request refreshes the right keys.
function refreshAfterRestore(
  { queryClient, scopeId, userId }: RestoreDependencies,
  item: Pick<ArchiveItem, 'id' | 'kind'>,
): Promise<unknown> {
  if (item.kind === 'template') {
    forgetRestoredTemplate(queryClient, item.id);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.archivedTemplates(userId, scopeId) }),
      queryClient.invalidateQueries({ queryKey: ['templates'] }),
      refreshRunLists(queryClient),
    ]);
  }
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.archivedRuns(userId, scopeId) }),
    refreshRunLists(queryClient),
  ]);
}

// Restores one archived item and refreshes the lists it returns to. Resolves false without a
// request when the same item is already being restored; rejects with the server's error.
// When the item already left the archive, the lists are refreshed before rejecting, so its
// row goes instead of offering a Restore that fails every time.
export async function restoreArchiveItem(
  dependencies: RestoreDependencies,
  item: Pick<ArchiveItem, 'id' | 'kind'>,
): Promise<boolean> {
  const { pending } = dependencies;
  if (pending.has(item.id)) return false;

  pending.add(item.id);
  try {
    try {
      await (item.kind === 'template' ? dependencies.restoreTemplate(item.id) : dependencies.restoreRun(item.id));
    } catch (error) {
      if (isNoLongerArchivedError(error)) {
        // A failed refresh must not replace the restore error the caller shows.
        await refreshAfterRestore(dependencies, item).catch(() => {});
      }
      throw error;
    }
    await refreshAfterRestore(dependencies, item);
    return true;
  } finally {
    pending.delete(item.id);
  }
}
