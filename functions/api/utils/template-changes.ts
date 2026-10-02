import { describePayloadError, normalizeStringArray, parseJsonArray, templatePayloadSchema } from './payloads';
import { assignMissingStableTemplateIdentities } from './template-reconciliation';

type Row = Record<string, unknown>;

const RUN_STATE_KEYS = new Set(['isCompleted', 'completed', 'notes']);

const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const byKey = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(byKey).map(([key, entry]) => [key, sortKeysDeep(entry)]));
}

function canonicalStructure(value: unknown, isContentBlock = false): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalStructure(entry, isContentBlock));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !RUN_STATE_KEYS.has(key) && !isEmptyValue(entry) && !(isContentBlock && key === 'id'))
      .sort(byKey)
      .map(([key, entry]) => [key, canonicalStructure(entry, key === 'contents')]),
  );
}

export function templateStructureChanged(storedSections: unknown[], incomingStableSections: unknown[]): boolean {
  const stored = assignMissingStableTemplateIdentities(storedSections, storedSections);
  return JSON.stringify(canonicalStructure(stored)) !== JSON.stringify(canonicalStructure(incomingStableSections));
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const jsonList = (value: unknown) => {
  const parsed = parseJsonArray(value);
  return parsed && parsed.length > 0 ? JSON.stringify(sortKeysDeep(parsed)) : '';
};
const stringList = (value: unknown) => JSON.stringify(normalizeStringArray(value));

const COLUMN_NORMALIZERS: Record<string, (value: unknown) => unknown> = {
  title: text,
  description: text,
  type: (value) => text(value) || 'checklist',
  seo_title: text,
  seo_description: text,
  slug: text,
  rules: jsonList,
  category: stringList,
  tags: stringList,
  is_public: (value) => value === true || value === 1,
};

export function omitUnchangedTemplateColumns(existing: Row, updates: Row): Row {
  return Object.fromEntries(
    Object.entries(updates).filter(([column, value]) => {
      const normalize = COLUMN_NORMALIZERS[column];
      return !normalize || normalize(value) !== normalize(existing[column]);
    }),
  );
}

const REQUEST_FIELDS_BY_COLUMN: Record<string, string[]> = {
  title: ['title'],
  description: ['description'],
  seo_title: ['seoTitle'],
  seo_description: ['seoDescription'],
  rules: ['rules'],
  category: ['categories', 'category'],
  tags: ['tags'],
};

export function validateChangedTemplateFields(
  changes: Row,
  body: Row,
): { message: string; details: { field?: string } } | null {
  const changedFields = Object.fromEntries(
    Object.keys(changes).flatMap((column) =>
      (REQUEST_FIELDS_BY_COLUMN[column] ?? []).filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
    ),
  );
  const result = templatePayloadSchema.safeParse(changedFields);
  return result.success ? null : describePayloadError(result.error, 'Invalid template payload');
}

const CONTENT_FIELDS = [
  'title', 'description', 'type', 'seoTitle', 'seoDescription', 'rules', 'sections', 'items',
  'categories', 'category', 'tags',
] as const;

export function requestsContentChange(body: Row, slugChanged: boolean): boolean {
  return slugChanged || CONTENT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

export function visibilityChangeMetadata(changes: Row): { visibility: 'public' | 'private' } | undefined {
  const keys = Object.keys(changes);
  if (keys.length !== 1 || keys[0] !== 'is_public') return undefined;
  return { visibility: changes.is_public ? 'public' : 'private' };
}
