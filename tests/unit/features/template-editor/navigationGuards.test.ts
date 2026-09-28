import { describe, expect, it, vi } from 'vitest';

import {
  EDITOR_REPLACE_DRAFT_MESSAGE,
  EDITOR_SAVE_IN_PROGRESS_MESSAGE,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  EDITOR_UPLOAD_IN_PROGRESS_MESSAGE,
  applyTemplateBeforeUnloadWarning,
  confirmReplaceTemplateDraft,
  confirmTemplateEditorNavigation,
  getTemplateEditorLeaveMessage,
  shouldBlockTemplateEditorNavigation,
  shouldBlockTemplateEditorTransition,
} from '@/features/template-editor/navigationGuards';

describe('template editor navigation guards', () => {
  it('blocks navigation when there are unsaved changes and nothing is loading', () => {
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

  // A save can still fail (a conflict, a slug rule, a network error, or the unload
  // aborting it), and the edits exist only in the form until it succeeds.
  it('never allows leaving unasked while a save is unconfirmed', () => {
    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: true,
        loading: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: true,
        isSaving: true,
        loading: true,
      }),
    ).toBe(false);

    // A save of an unchanged form has nothing to lose.
    expect(
      shouldBlockTemplateEditorNavigation({
        isDirty: false,
        isSaving: true,
        loading: false,
      }),
    ).toBe(false);
  });

  it('says the template is still saving when leaving during a save', () => {
    expect(
      getTemplateEditorLeaveMessage({ hasPendingUploads: false, isSaving: true }),
    ).toBe(EDITOR_SAVE_IN_PROGRESS_MESSAGE);
    expect(
      getTemplateEditorLeaveMessage({ hasPendingUploads: false, isSaving: false }),
    ).toBe(EDITOR_UNSAVED_CHANGES_MESSAGE);
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

// Generating from Clipy replaces the whole form, so unsaved work needs a yes first.
describe('confirmReplaceTemplateDraft', () => {
  it('replaces a clean form without asking', () => {
    const confirmDialog = vi.fn(() => false);

    expect(confirmReplaceTemplateDraft(false, confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('asks before replacing unsaved work and follows the answer', () => {
    const decline = vi.fn(() => false);
    const accept = vi.fn(() => true);

    expect(confirmReplaceTemplateDraft(true, decline)).toBe(false);
    expect(confirmReplaceTemplateDraft(true, accept)).toBe(true);
    expect(decline).toHaveBeenCalledWith(EDITOR_REPLACE_DRAFT_MESSAGE);
    expect(EDITOR_REPLACE_DRAFT_MESSAGE).toMatch(/unsaved changes will be lost/);
  });
});
