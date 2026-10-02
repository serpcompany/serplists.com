import { describe, expect, it, vi } from 'vitest';

import {
  EDITOR_REPLACE_DRAFT_MESSAGE,
  EDITOR_RESTORE_DRAFT_MESSAGE,
  EDITOR_SAVE_IN_PROGRESS_MESSAGE,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  EDITOR_UPLOAD_IN_PROGRESS_MESSAGE,
  confirmReplaceTemplateDraft,
  getTemplateEditorLeaveMessage,
  restoreKeptTemplateDraft,
  shouldBlockTemplateEditorNavigation,
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

  it('never allows leaving unasked while a save is unconfirmed, since it can still fail and the edits live only in the form until it succeeds', () => {
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
  });

  it('lets a clean form go during a save, which has nothing to lose', () => {
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

  it('blocks leaving while a file is still uploading, even with no other edits, since the form changes only once the upload finishes', () => {
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
});

describe('confirmReplaceTemplateDraft, before generating from Clipy replaces the whole form', () => {
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

describe('restoreKeptTemplateDraft, which replaces the whole form too', () => {
  const kept = { title: 'Kept draft A' };

  it('restores into a clean form without asking', () => {
    const confirmDialog = vi.fn(() => false);
    const takeDraft = vi.fn(() => kept);
    const apply = vi.fn();

    expect(restoreKeptTemplateDraft({ hasUnsavedWork: false, takeDraft, apply, confirmDialog })).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(kept);
  });

  it('keeps unsaved work, and the draft with its notice, when the user says no, since it asks before taking the draft', () => {
    const confirmDialog = vi.fn(() => false);
    const takeDraft = vi.fn(() => kept);
    const apply = vi.fn();

    expect(restoreKeptTemplateDraft({ hasUnsavedWork: true, takeDraft, apply, confirmDialog })).toBe(false);
    expect(confirmDialog).toHaveBeenCalledWith(EDITOR_RESTORE_DRAFT_MESSAGE);
    expect(EDITOR_RESTORE_DRAFT_MESSAGE).toMatch(/unsaved changes will be lost/);
    expect(takeDraft).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('replaces unsaved work after a yes', () => {
    const apply = vi.fn();

    expect(
      restoreKeptTemplateDraft({
        hasUnsavedWork: true,
        takeDraft: () => kept,
        apply,
        confirmDialog: () => true,
      }),
    ).toBe(true);
    expect(apply).toHaveBeenCalledWith(kept);
  });

  it('does nothing when no draft is left to take', () => {
    const apply = vi.fn();

    expect(restoreKeptTemplateDraft({ hasUnsavedWork: false, takeDraft: () => null, apply })).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
