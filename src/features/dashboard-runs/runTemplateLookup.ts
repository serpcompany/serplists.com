import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export type RunSourceTemplate = Pick<ChecklistTemplate, 'id' | 'isPublic' | 'ownerProfile' | 'teamId' | 'title'>;
export type RunStatusFilter = 'all' | 'in_progress' | 'completed';

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

export function findRunTemplate<T>(
  lookup: ReadonlyMap<string, T>,
  templateId: string | undefined,
): T | undefined {
  return templateId ? lookup.get(templateId) : undefined;
}

export function filterDashboardRuns(
  runs: readonly ChecklistRun[],
  lookup: ReadonlyMap<string, Pick<RunSourceTemplate, 'ownerProfile' | 'title'>>,
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
