import { mapChecklistRuns } from '@/features/run-execution/runExecutionMappers';
import { isApiError } from '@/lib/api-errors';
import type { ApiRun } from '@/lib/schemas/apiRuns';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import { mapApiTemplate } from '@/lib/templates/apiTemplateMapper';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export type TemplateListRequest = { teamId?: string; scope?: 'public' | 'personal' };

export const CATALOG_QUERY_KEY = ['templates', 'catalog'] as const;

export type TemplateListClient = {
  getTemplates: (request: TemplateListRequest) => Promise<ApiTemplate[]>;
  getChecklists: (params?: { teamId?: string }) => Promise<ApiRun[]>;
};

const mapReadableRows = <T>(rows: ApiTemplate[], mapRow: (row: ApiTemplate) => T, kind: string): T[] =>
  rows.flatMap((row) => {
    try {
      return [mapRow(row)];
    } catch (error) {
      console.error(`Skipping a ${kind} that could not be read:`, String(row.id), error);
      return [];
    }
  });

export const createTemplateListFetcher =
  (client: TemplateListClient) =>
  (request: TemplateListRequest) =>
  async (): Promise<ChecklistTemplate[]> =>
    mapReadableRows(await client.getTemplates(request), mapApiTemplate, 'template');

export const fetchRunList = async (client: TemplateListClient, teamId?: string): Promise<ChecklistRun[]> =>
  mapChecklistRuns(await client.getChecklists(teamId ? { teamId } : undefined));

export const shouldRetryListFetch = (failureCount: number, error: unknown): boolean =>
  failureCount < 1 && !(isApiError(error) && error.status < 500);
