import type { ChecklistTemplate } from '@/types/checklist';

type RecencyFields = Pick<ChecklistTemplate, 'createdAt' | 'id' | 'title' | 'updatedAt'>;

// SQLite `datetime('now')` text ("YYYY-MM-DD HH:MM:SS") is UTC; Date.parse would read it as local time.
const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

const parseTimestamp = (value?: string | null): number => {
  if (!value) {
    return 0;
  }

  const ms = Date.parse(SQLITE_DATETIME.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * A Template's last activity: its last edit, or its creation when it was never
 * edited (the API returns a null `updated_at` for those). Unknown dates are 0.
 */
export const getTemplateRecencyTime = (template: RecencyFields): number =>
  parseTimestamp(template.updatedAt) || parseTimestamp(template.createdAt);

/**
 * Most recent activity first. Never returns NaN, and breaks ties by creation date,
 * title and id so the order does not depend on the input order.
 */
export const compareTemplatesByRecent = (left: RecencyFields, right: RecencyFields): number =>
  getTemplateRecencyTime(right) - getTemplateRecencyTime(left) ||
  parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt) ||
  left.title.localeCompare(right.title) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
