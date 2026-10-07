import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import type { ResourcePermissions } from '@/lib/organizationPermissions';
import { queryKeys } from '@/lib/queryKeys';
import { isTemplateDetailOf, isTemplateDetailQuery } from '@/lib/queryCache';
import { refreshRunLists } from '@/contexts/templateListCache';

const forgetRestoredTemplate = (queryClient: QueryClient, templateId: string): void => {
  queryClient.removeQueries({
    predicate: (query) => {
      const isUnviewed = query.getObserversCount() === 0;
      const isGoneAnswer = isTemplateDetailQuery(query) && query.state.data === null;
      return isUnviewed && (isTemplateDetailOf(query, templateId) || isGoneAnswer);
    },
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

export type ArchiveListState = 'loading' | 'error' | 'loaded';

export const getArchiveListState = (query: {
  data: readonly unknown[] | undefined;
  isError: boolean;
  isFetching: boolean;
}): ArchiveListState => {
  if (query.data !== undefined) return 'loaded';
  return query.isError && !query.isFetching ? 'error' : 'loading';
};

export const canRestoreArchiveItem = (permissions: ResourcePermissions, kind: ArchiveKind): boolean =>
  kind === 'template' ? permissions.canEditTemplates : permissions.canManage;

const isNoLongerArchivedError = (error: unknown): boolean =>
  isApiError(error) && (error.code === 'not_archived' || error.status === 404);

const isRoleRefusal = (error: unknown): boolean => isApiError(error) && error.status === 403 && !error.code;

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
  if (isRoleRefusal(error)) {
    return kind === 'template'
      ? 'Your role in this Organization cannot restore templates.'
      : 'Your role in this Organization cannot restore runs.';
  }
  return getApiErrorMessage(error, kind === 'template' ? 'Failed to restore template.' : 'Failed to restore run.');
}

type RestoreDependencies = {
  queryClient: QueryClient;
  restoringIds: Set<string>;
  restoreTemplate: (id: string) => Promise<unknown>;
  restoreRun: (id: string) => Promise<unknown>;
  userId: string | undefined;
  scopeId: string;
};

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

export async function restoreArchiveItem(
  dependencies: RestoreDependencies,
  item: Pick<ArchiveItem, 'id' | 'kind'>,
): Promise<boolean> {
  const { restoringIds } = dependencies;
  if (restoringIds.has(item.id)) return false;

  restoringIds.add(item.id);
  try {
    try {
      await (item.kind === 'template' ? dependencies.restoreTemplate(item.id) : dependencies.restoreRun(item.id));
    } catch (error) {
      if (isNoLongerArchivedError(error)) {
        await refreshAfterRestore(dependencies, item).catch(() => {});
      }
      throw error;
    }
    await refreshAfterRestore(dependencies, item);
    return true;
  } finally {
    restoringIds.delete(item.id);
  }
}
