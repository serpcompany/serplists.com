import { parseDbTimestamp } from '@/lib/utils/dbTimestamp';
import type { ChecklistTemplate } from '@/types/checklist';

type RecencyFields = Pick<ChecklistTemplate, 'createdAt' | 'id' | 'title' | 'updatedAt'>;

const parseTimestamp = (value: string): number => parseDbTimestamp(value)?.getTime() ?? 0;

export const getTemplateRecencyTime = (template: RecencyFields): number =>
  parseTimestamp(template.updatedAt) || parseTimestamp(template.createdAt);

export const compareTemplatesByRecent = (left: RecencyFields, right: RecencyFields): number =>
  getTemplateRecencyTime(right) - getTemplateRecencyTime(left) ||
  parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt) ||
  left.title.localeCompare(right.title) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
