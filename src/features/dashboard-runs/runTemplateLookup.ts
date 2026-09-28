import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export type RunSourceTemplate = Pick<ChecklistTemplate, 'id' | 'ownerProfile' | 'title'>;
export type RunStatusFilter = 'all' | 'in_progress' | 'completed';

// The runs page links each run to the Template it started from. The catalog holds only
// public Templates, so a run from a private Personal or Organization Template finds its
// source in the workspace list; an Organization run from someone else's public Template
// finds it only in the catalog. The workspace copy wins because the catalog is
// edge-cached for up to five minutes.
export function buildRunTemplateLookup<T extends { id: string }>(
  catalog: readonly T[],
  workspace: readonly T[] | undefined,
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const template of [...catalog, ...(workspace ?? [])]) {
    byId.set(template.id, template);
  }
  return byId;
}

// Runs started from a library Template store no template_id, so an empty id never matches.
export function findRunTemplate<T>(
  lookup: ReadonlyMap<string, T>,
  templateId: string | undefined,
): T | undefined {
  return templateId ? lookup.get(templateId) : undefined;
}

export function filterDashboardRuns(
  runs: readonly ChecklistRun[],
  lookup: ReadonlyMap<string, RunSourceTemplate>,
  searchQuery: string,
  statusFilter: RunStatusFilter,
): ChecklistRun[] {
  const lowerSearch = searchQuery.toLowerCase();

  return runs
    .filter((run) => {
      const template = findRunTemplate(lookup, run.templateId);
      const matchesSearch = [
        run.title,
        run.status,
        template?.title ?? '',
        template?.ownerProfile?.username ?? '',
        template?.ownerProfile?.full_name ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(lowerSearch);
      const matchesStatus = statusFilter === 'all' || run.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort(
      (left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
    );
}
