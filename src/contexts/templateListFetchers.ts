import { z } from 'zod';

import { mapChecklistRuns } from '@/features/run-execution/runExecutionMappers';
import { isApiError } from '@/lib/api-errors';
import { readApiTemplateTeamId } from '@/lib/templates/apiTemplateOwner';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

export type TemplateListRequest = { teamId?: string; scope?: 'public' | 'personal' };

// The public catalog (?scope=public) is the same for everyone, so its key has no user.
export const CATALOG_QUERY_KEY = ['templates', 'catalog'] as const;

type ApiRow = Record<string, unknown>;
const apiRows = z.array(z.record(z.unknown()));

// The part of the API client the list fetchers use, so tests can pass a fake.
export type TemplateListClient = {
  getTemplates: (request: TemplateListRequest) => Promise<unknown>;
  getChecklists: (params?: { teamId?: string }) => Promise<unknown>;
};

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const parseJsonField = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

const templateSections = (template: ApiRow): unknown => {
  if (template.sections) return template.sections;
  if (!template.items) return [];
  const parsedItems = parseJsonField(template.items);
  if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
    return parsedItems;
  }
  return [{ id: '1', title: 'Checklist', items: parsedItems }];
};

export const mapApiTemplate = (template: ApiRow): ChecklistTemplate => ({
  id: String(template.id),
  title: String(template.title || ''),
  description: optionalString(template.description) ?? '',
  type: typeof template.type === 'string' ? template.type as 'checklist' | 'recipe' : 'checklist',
  seoTitle: optionalString(template.seoTitle) ?? '',
  seoDescription: optionalString(template.seoDescription) ?? '',
  rules: Array.isArray(template.rules) ? template.rules as ChecklistTemplate['rules'] : undefined,
  seoUrl: optionalString(template.slug) ?? '',
  sections: normalizeSections(templateSections(template)),
  categories: Array.isArray(template.categories)
    ? template.categories as string[]
    : (template.category ? [String(template.category)] : []),
  tags: typeof template.tags === 'string'
    ? JSON.parse(template.tags)
    : (Array.isArray(template.tags) ? template.tags as string[] : []),
  userId: optionalString(template.user_id) ?? '',
  createdAt: optionalString(template.created_at) ?? '',
  // A never-edited template has a null updated_at; its last activity is its creation.
  updatedAt: String(template.updated_at || template.created_at || ''),
  isPublic: Boolean(template.is_public),
  slug: optionalString(template.slug) ?? '',
  version: typeof template.version === 'number' ? template.version : 1,
  teamId: readApiTemplateTeamId(template),
  // Public catalog rows carry no team_id, so owner_type is what marks an Organization template.
  ownerType: template.owner_type === 'team' || template.owner_type === 'user' ? template.owner_type : undefined,
  ownerProfile:
    typeof template.owner_username === 'string' || typeof template.owner_full_name === 'string'
      ? { username: optionalString(template.owner_username), full_name: optionalString(template.owner_full_name) }
      : undefined,
});

// Maps each row on its own, so one malformed row (for example corrupt JSON in `items`) is
// skipped and logged instead of failing or emptying the whole list.
const mapRows = <T>(rows: unknown, mapRow: (row: ApiRow) => T, kind: string): T[] =>
  apiRows.parse(rows).flatMap((row) => {
    try {
      return [mapRow(row)];
    } catch (error) {
      console.error(`Skipping a ${kind} that could not be read:`, String(row.id), error);
      return [];
    }
  });

// List fetches reject when the request fails, so React Query retries, reports the error, and
// keeps the last good list. Resolving to [] would cache an empty list as fresh for 5 minutes.
export const createTemplateListFetcher =
  (client: TemplateListClient) =>
  (request: TemplateListRequest) =>
  async (): Promise<ChecklistTemplate[]> =>
    mapRows(await client.getTemplates(request), mapApiTemplate, 'template');

// A run whose content cannot be read is still listed, with no tasks, so it can be deleted
// (mapChecklistRuns).
export const fetchRunList = async (client: TemplateListClient, teamId?: string): Promise<ChecklistRun[]> =>
  mapChecklistRuns(apiRows.parse(await client.getChecklists(teamId ? { teamId } : undefined)));

// Retry a failed list load once, like the app default, unless the server refused the request
// (signed out, no access, not found, rate limited): repeating it right away cannot help.
export const shouldRetryListFetch = (failureCount: number, error: unknown): boolean =>
  failureCount < 1 && !(isApiError(error) && error.status < 500);
