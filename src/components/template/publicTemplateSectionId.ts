import type { ChecklistSection } from '@/types/checklist';

export const buildPublicTemplateSectionId = (
  section: ChecklistSection,
  sectionIndex: number,
) => {
  const base = section.title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base ? `section-${base}` : `section-${sectionIndex + 1}`;
};
