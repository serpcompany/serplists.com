import { api } from '@/lib/api';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

// How the run page writes a run: through the page's private updateRun, or the share link's PUT.

export type RunExecutionApiClient = Pick<
  typeof api,
  | 'createChecklistRunShare'
  | 'getChecklistById'
  | 'getSharedChecklist'
  | 'updateSharedChecklist'
>;

// Private run saves. Only a rename passes { includeTitle: true }: a stored title can predate
// the 160-character limit, and resending it would fail every tick, note and completion.
export type UpdateRun = (
  run: ChecklistRun,
  options?: { includeTitle?: boolean },
) => void | Promise<ChecklistRun | void>;

export type RunExecutionDependencies = {
  apiClient?: RunExecutionApiClient;
  // Called once a share has made the run public, so cached runs lists can follow.
  onShared?: (runId: string) => void;
  origin?: string;
  updateRun: UpdateRun;
};

export type RunExecutionMutationParams = {
  run?: ChecklistRun | null;
  shareToken?: string;
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
