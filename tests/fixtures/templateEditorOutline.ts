import type { TemplateEditorFormSource } from '@/lib/forms/templateEditorForm';

type OutlineSection = { id: string; title: string; items: Array<{ id: string; title: string; contents: [] }> };

export const launchOutline = ({
  secondTaskTitle = 'Bump version',
  moreSections = [],
}: { secondTaskTitle?: string; moreSections?: OutlineSection[] } = {}): TemplateEditorFormSource => ({
  title: 'Launch',
  sections: [
    {
      id: 'section-1',
      title: 'Prepare',
      items: [
        { id: 'task-1', title: 'Write notes', contents: [] },
        { id: 'task-2', title: secondTaskTitle, contents: [] },
        { id: 'task-3', title: 'Tag release', contents: [] },
      ],
    },
    { id: 'section-2', title: 'Ship', items: [{ id: 'task-4', title: 'Deploy', contents: [] }] },
    ...moreSections,
  ],
});
