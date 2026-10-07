import type { ChecklistTemplate } from '@/types/checklist';

export const countTemplateItems = (template: Pick<ChecklistTemplate, 'sections'>): number =>
  template.sections.reduce((total, section) => total + section.items.length, 0);
