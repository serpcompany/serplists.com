import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('leave guard wiring', () => {
  it('guards every way out of a dirty template editor', () => {
    expect(readSource('src/views/TemplateEditor.tsx')).toContain('useTemplateEditorLeaveGuard(');
    expect(readSource('src/features/template-editor/useTemplateEditorLeaveGuard.ts')).toContain(
      'useUnsavedChangesGuard(',
    );
  });

  it('guards every way out of a run page with task notes that live only on the page until Save notes, asking once', () => {
    const runPage = readSource('src/views/ChecklistRun.tsx');

    expect(runPage).toContain('useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE');
    expect(runPage).not.toContain('confirmLeaveWithUnsavedNotes');
  });
});
