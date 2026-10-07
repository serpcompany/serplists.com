import type { ChecklistFormField } from '@/types/checklist';

export const formFieldTitle = (field: Pick<ChecklistFormField, 'label'>, index: number): string =>
  field.label.trim() || `Field ${index + 1}`;

export const formOptionTitle = (option: { label: string }, index: number): string =>
  option.label.trim() || `Option ${index + 1}`;
