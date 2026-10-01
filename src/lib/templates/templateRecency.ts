import type { ChecklistTemplate } from '@/types/checklist';

type RecencyFields = Pick<ChecklistTemplate, 'createdAt' | 'id' | 'title' | 'updatedAt'>;

const SQLITE_UTC_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

const asUtcIsoString = (sqliteUtcDatetime: string): string => `${sqliteUtcDatetime.replace(' ', 'T')}Z`;

const parseTimestamp = (value?: string | null): number => {
  if (!value) {
    return 0;
  }

  const ms = Date.parse(SQLITE_UTC_DATETIME.test(value) ? asUtcIsoString(value) : value);
  return Number.isFinite(ms) ? ms : 0;
};

export const getTemplateRecencyTime = (template: RecencyFields): number =>
  parseTimestamp(template.updatedAt) || parseTimestamp(template.createdAt);

export const compareTemplatesByRecent = (left: RecencyFields, right: RecencyFields): number =>
  getTemplateRecencyTime(right) - getTemplateRecencyTime(left) ||
  parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt) ||
  left.title.localeCompare(right.title) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
