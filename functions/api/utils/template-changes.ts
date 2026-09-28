import { normalizeStringArray, parseJsonArray } from './payloads';
import { assignMissingStableTemplateIdentities } from './template-reconciliation';

// Clients resend the whole Template on every save (editor saves, visibility toggles), so a
// PUT must compare values with the stored row rather than trust which keys are present.
// Otherwise every save bumps content_version, marks every unreconciled run stale, and
// rewrites every active run (see docs/product-specs/portable-templates.md).

type Row = Record<string, unknown>;

// Run state that clients carry inside section JSON; it is never checklist structure.
const RUN_STATE_KEYS = new Set(['isCompleted', 'completed', 'notes']);

const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const byKey = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(byKey).map(([key, entry]) => [key, sortKeysDeep(entry)]));
}

// Drops run state and empty values (an editor's `description: ''` or `contents: []` equals a
// missing key) and sorts keys. Array order is kept: reordering is a real structure change.
function canonicalStructure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalStructure);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !RUN_STATE_KEYS.has(key) && !isEmptyValue(entry))
      .sort(byKey)
      .map(([key, entry]) => [key, canonicalStructure(entry)]),
  );
}

/**
 * True when `incomingStableSections` (already given stable identities against the stored
 * sections) differ from the stored checklist structure. Only then may a save bump
 * content_version and reconcile runs.
 */
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

// How each comparable templates column is normalized before comparing. `items` is not listed:
// callers add it only after templateStructureChanged reports a change.
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

/** Returns the update values that differ from the stored Template row. */
export function omitUnchangedTemplateColumns(existing: Row, updates: Row): Row {
  return Object.fromEntries(
    Object.entries(updates).filter(([column, value]) => {
      const normalize = COLUMN_NORMALIZERS[column];
      return !normalize || normalize(value) !== normalize(existing[column]);
    }),
  );
}

/** Visibility is not part of a Template version; every other stored column is. */
export function isVersionedTemplateChange(changes: Row): boolean {
  return Object.keys(changes).some((column) => column !== 'is_public');
}
