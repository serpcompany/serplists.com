import { describe, expect, it, vi } from 'vitest';

import {
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  EDITOR_UPLOAD_IN_PROGRESS_MESSAGE,
  applyTemplateBeforeUnloadWarning,
  confirmTemplateEditorNavigation,
  getTemplateEditorLeaveMessage,
  shouldBlockTemplateEditorNavigation,
  shouldBlockTemplateEditorTransition,
} from '@/features/template-editor/navigationGuards';

describe('template editor navigation guards', () => {
  it('blocks navigation only when there are unsaved changes and no save/load is active', () => {
    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: false,
        loading: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: true,
        loading: false,
      }),
    ).toBe(false);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: false,
        loading: true,
      }),
    ).toBe(false);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: false,
        isSaving: false,
        loading: false,
      }),
    ).toBe(false);
  });

  // Picking a file does not change the form until the upload finishes, so a clean form
  // must still ask: leaving would drop the file.
  it('blocks leaving while a file is still uploading, even with no other edits', () => {
    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: false,
        isSaving: false,
        loading: false,
        hasPendingUploads: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: false,
        isSaving: false,
        loading: true,
        hasPendingUploads: true,
      }),
    ).toBe(false);
  });

  it('says a file is still uploading when that is what would be lost', () => {
    expect(getTemplateEditorLeaveMessage({ hasPendingUploads: true })).toBe(
      EDITOR_UPLOAD_IN_PROGRESS_MESSAGE,
    );
    expect(getTemplateEditorLeaveMessage({ hasPendingUploads: false })).toBe(
      EDITOR_UNSAVED_CHANGES_MESSAGE,
    );
  });

  it('uses a confirmation prompt for guarded in-app navigation', () => {
    const confirm = vi.fn(() => false);

    expect(confirmTemplateEditorNavigation(true, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(EDITOR_UNSAVED_CHANGES_MESSAGE);
  });

  it('asks with the message it is given', () => {
    const confirm = vi.fn(() => true);

    expect(
      confirmTemplateEditorNavigation(true, confirm, EDITOR_UPLOAD_IN_PROGRESS_MESSAGE),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledWith(EDITOR_UPLOAD_IN_PROGRESS_MESSAGE);
  });

  it('allows unguarded navigation without prompting', () => {
    const confirm = vi.fn(() => false);

    expect(confirmTemplateEditorNavigation(false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('applies a browser beforeunload warning only when guarded', () => {
    const guardedEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    };
    const unguardedEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    };

    applyTemplateBeforeUnloadWarning(guardedEvent, true);
    applyTemplateBeforeUnloadWarning(unguardedEvent, false);

    expect(guardedEvent.preventDefault).toHaveBeenCalled();
    expect(guardedEvent.returnValue).toBe('');
    expect(unguardedEvent.preventDefault).not.toHaveBeenCalled();
    expect(unguardedEvent.returnValue).toBeUndefined();
  });
});

describe('shouldBlockTemplateEditorTransition', () => {
  it('blocks leaving the editor route while there are unsaved changes', () => {
    expect(
      shouldBlockTemplateEditorTransition({
        shouldBlock: true,
        currentPath: '/dashboard/templates/template-1/edit',
        nextPath: '/dashboard/runs',
      }),
    ).toBe(true);
  });

  it('does not block a search or hash change on the same editor route', () => {
    expect(
      shouldBlockTemplateEditorTransition({
        shouldBlock: true,
        currentPath: '/dashboard/templates/template-1/edit',
        nextPath: '/dashboard/templates/template-1/edit',
      }),
    ).toBe(false);
  });

  it('does not block when there is nothing to lose', () => {
    expect(
      shouldBlockTemplateEditorTransition({
        shouldBlock: false,
        currentPath: '/dashboard/templates/template-1/edit',
        nextPath: '/dashboard/runs',
      }),
    ).toBe(false);
  });
});
