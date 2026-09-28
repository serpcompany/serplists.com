import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

export type RunUpdateOptions = { includeTitle?: boolean };

// The body of PUT /api/checklists/:id for a private run save. The title is sent only for a
// rename: the API limits titles to 160 characters, and a stored title can be longer (runs
// from before the limit, or started from a Template with a long title), so resending it with
// every tick, note or completion would fail each of those saves.
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
