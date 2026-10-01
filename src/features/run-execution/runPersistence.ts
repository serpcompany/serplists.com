import { api } from '@/lib/api';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

export type RunExecutionApiClient = Pick<
  typeof api,
  | 'createChecklistRunShare'
  | 'getChecklistById'
  | 'getSharedChecklist'
  | 'revokeChecklistRunShare'
  | 'updateSharedChecklist'
>;

export type UpdateRun = (
  run: ChecklistRun,
  options?: { includeTitle?: boolean },
) => void | Promise<ChecklistRun | void>;

export type RunExecutionDependencies = {
  apiClient?: RunExecutionApiClient | undefined;
  onShared?: (runId: string) => void;
  origin?: string | undefined;
  refreshRuns?: () => unknown;
  updateRun: UpdateRun;
};

export type RunExecutionMutationParams = {
  run?: ChecklistRun | null;
  shareToken?: string | undefined;
};

export const getApiClient = (
  dependencies: RunExecutionDependencies,
): RunExecutionApiClient => dependencies.apiClient ?? api;

export const persistRun = async (
  params: RunExecutionMutationParams & { includeTitle?: boolean },
  dependencies: RunExecutionDependencies,
): Promise<ChecklistRun> => {
  if (!params.run) {
    throw new Error('Run not found.');
  }

  const apiClient = getApiClient(dependencies);
  const progress = calculateSectionsProgress(params.run.sections);
  const nextRun = { ...params.run, progress };

  if (params.shareToken) {
    const result = await apiClient.updateSharedChecklist(params.shareToken, {
      completed_at: nextRun.completedAt,
      expected_revision: nextRun.revision,
      progress,
      sections: nextRun.sections,
      status: nextRun.status,
    });
    return {
      ...nextRun,
      revision:
        typeof (result as { revision?: unknown })?.revision === 'number'
          ? (result as { revision: number }).revision
          : nextRun.revision,
    };
  }

  const persisted = params.includeTitle
    ? await dependencies.updateRun(nextRun, { includeTitle: true })
    : await dependencies.updateRun(nextRun);
  return persisted ?? nextRun;
};
