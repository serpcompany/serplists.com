import { ownerConsoleContext } from '@/lib/consoleRoutes';
import { buildConsoleTemplatePath } from '@/lib/routes';
import { resolveTemplateConsoleContext } from '@/lib/templateDestination';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export type RunSourceTemplate = Pick<ChecklistTemplate, 'id' | 'isPublic' | 'ownerProfile' | 'teamId' | 'title'>;
export type RunStatusFilter = 'all' | 'in_progress' | 'completed';

export const runTemplatePath = (run: ChecklistRun, template: RunSourceTemplate): string =>
  buildConsoleTemplatePath(template.id, resolveTemplateConsoleContext(template, ownerConsoleContext(run.teamId)));

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

export type RunTemplateOption = { id: string; title: string | null };

export function runTemplateFilterOptions(
  runs: readonly ChecklistRun[],
  lookup: ReadonlyMap<string, Pick<RunSourceTemplate, 'title'>>,
  selectedTemplateId: string | null,
): RunTemplateOption[] {
  const templateIds = new Set(runs.map((run) => run.templateId).filter(Boolean));
  const options: RunTemplateOption[] = [...templateIds].flatMap((id) => {
    const template = lookup.get(id);
    return template ? [{ id, title: template.title }] : [];
  });
  if (selectedTemplateId && !options.some((option) => option.id === selectedTemplateId)) {
    options.push({ id: selectedTemplateId, title: lookup.get(selectedTemplateId)?.title ?? null });
  }
  return options.sort((left, right) => (left.title ?? '').localeCompare(right.title ?? ''));
}

export function filterDashboardRuns(
  runs: readonly ChecklistRun[],
  lookup: ReadonlyMap<string, Pick<RunSourceTemplate, 'ownerProfile' | 'title'>>,
  searchQuery: string,
  statusFilter: RunStatusFilter,
  templateFilter: string | null = null,
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
      const matchesTemplate = templateFilter === null || run.templateId === templateFilter;

      return matchesSearch && matchesStatus && matchesTemplate;
    })
    .sort(
      (left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
    );
}
