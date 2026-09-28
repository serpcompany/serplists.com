import { z } from 'zod';

import { isApiError } from '@/lib/api-errors';
import { readApiTemplateTeamId } from '@/lib/templates/apiTemplateOwner';
import { calculateSectionsProgress, isSectionsShape, normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistRun, ChecklistSection, ChecklistTemplate } from '@/types/checklist';

export type TemplateListRequest = { teamId?: string; scope?: 'public' | 'personal' };

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
  ownerProfile:
    typeof template.owner_username === 'string' || typeof template.owner_full_name === 'string'
      ? { username: optionalString(template.owner_username), full_name: optionalString(template.owner_full_name) }
      : undefined,
});

const runSections = (checklist: ApiRow): ChecklistSection[] => {
  const raw = parseJsonField(checklist.items) || [];
  if (isSectionsShape(raw)) return raw;
  return [{ id: '1', title: 'Checklist', items: raw as ChecklistSection['items'] }];
};

export const mapApiRun = (checklist: ApiRow): ChecklistRun => {
  const sections = normalizeSections(runSections(checklist));
  return {
    id: String(checklist.id),
    templateId: optionalString(checklist.template_id) ?? '',
    title: String(checklist.title ?? ''),
    status: checklist.status === 'completed' ? 'completed' : 'in_progress',
    progress: calculateSectionsProgress(sections),
    sections,
    startedAt: optionalString(checklist.started_at) || optionalString(checklist.created_at) || '',
    completedAt: optionalString(checklist.completed_at) || undefined,
    userId: optionalString(checklist.user_id) ?? '',
    teamId: optionalString(checklist.team_id),
    templateVersion: typeof checklist.template_version === 'number' ? checklist.template_version : 1,
    revision: typeof checklist.revision === 'number' ? checklist.revision : 1,
    isStale: checklist.is_stale === true,
    isPublic: checklist.is_public === true || checklist.is_public === 1,
  };
};

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

export const fetchRunList = async (client: TemplateListClient, teamId?: string): Promise<ChecklistRun[]> =>
  mapRows(await client.getChecklists(teamId ? { teamId } : undefined), mapApiRun, 'run');

// Retry a failed list load once, like the app default, unless the server refused the request
// (signed out, no access, not found, rate limited): repeating it right away cannot help.
export const shouldRetryListFetch = (failureCount: number, error: unknown): boolean =>
  failureCount < 1 && !(isApiError(error) && error.status < 500);
