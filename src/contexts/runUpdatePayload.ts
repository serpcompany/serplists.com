import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

export type RunUpdateOptions = { includeTitle?: boolean };

export function buildRunUpdatePayload(run: ChecklistRun, options: RunUpdateOptions = {}) {
  return {
    ...(options.includeTitle ? { title: run.title } : {}),
    status: run.status,
    progress: calculateSectionsProgress(run.sections),
    sections: run.sections,
    completed_at: run.completedAt,
    expected_revision: run.revision,
  };
}
