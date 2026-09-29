import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// The pages that hold work only they have use the leave guard, which covers every way out:
// the app's Link and useAppRouter, browser Back/Forward, Sign out, and a reload or tab close
// (tests/unit/lib/navigation/useUnsavedChangesGuard.test.tsx). ESLint keeps the rest of the
// app on the guarded Link and router (no-restricted-imports in eslint.config.js).
describe('leave guard wiring', () => {
  it('guards every way out of a dirty template editor', () => {
    expect(readSource('src/views/TemplateEditor.tsx')).toContain('useTemplateEditorLeaveGuard(');
    expect(readSource('src/features/template-editor/useTemplateEditorLeaveGuard.ts')).toContain(
      'useUnsavedChangesGuard(',
    );
  });

  // Task notes are kept only on the page until Save notes: a sidebar link, browser Back,
  // or Sign out must ask first, as the page's own Runs button does.
  it('guards every way out of a run page with unsaved task notes, asking once', () => {
    const runPage = readSource('src/views/ChecklistRun.tsx');

    expect(runPage).toContain('useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE');
    expect(runPage).not.toContain('confirmLeaveWithUnsavedNotes');
  });
});
