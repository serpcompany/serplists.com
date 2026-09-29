export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  'You have unsaved template changes. Leave without saving?';

export const EDITOR_LOAD_LATEST_MESSAGE =
  'Load the latest saved version of this template? Your unsaved changes will be lost.';

export const EDITOR_UPLOAD_IN_PROGRESS_MESSAGE =
  'A file is still uploading. If you leave now, it will not be added to the template. Leave anyway?';

export const EDITOR_SAVE_IN_PROGRESS_MESSAGE =
  'Your template is still saving. If the save fails, your changes will be lost. Leave anyway?';

export const EDITOR_REPLACE_DRAFT_MESSAGE =
  'Replace your template with the draft generated from Clipy? Your unsaved changes will be lost.';

export const EDITOR_RESTORE_DRAFT_MESSAGE =
  'Replace your template with the kept draft? Your unsaved changes will be lost.';

// A picked file changes the form only when its upload finishes, so a pending upload
// counts as unsaved work even when the form is clean. A save in flight never lifts the
// guard: it can still fail (a conflict, a slug rule, a network error, or the unload
// aborting it), and until it succeeds the edits exist only in the form. isSaving only
// picks the message (getTemplateEditorLeaveMessage).
export const shouldBlockTemplateEditorNavigation = ({
  isDirty,
  loading,
  hasPendingUploads = false,
}: {
  isDirty: boolean;
  isSaving: boolean;
  loading: boolean;
  hasPendingUploads?: boolean;
}): boolean => (isDirty || hasPendingUploads) && !loading;

export const getTemplateEditorLeaveMessage = ({
  hasPendingUploads,
  isSaving = false,
}: {
  hasPendingUploads: boolean;
  isSaving?: boolean;
}): string => {
  if (hasPendingUploads) {
    return EDITOR_UPLOAD_IN_PROGRESS_MESSAGE;
  }

  return isSaving ? EDITOR_SAVE_IN_PROGRESS_MESSAGE : EDITOR_UNSAVED_CHANGES_MESSAGE;
};

// A draft generated from Clipy replaces the whole form (it has no undo), so unsaved work
// needs a yes first. Asked before the request, so a no costs no generation.
export const confirmReplaceTemplateDraft = (
  isDirty: boolean,
  confirmDialog: (message: string) => boolean = (message) => window.confirm(message),
): boolean => !isDirty || confirmDialog(EDITOR_REPLACE_DRAFT_MESSAGE);

// Restore draft replaces the whole form too. The user answers before the draft is taken,
// so a no leaves the form, the notice and the kept draft as they were. Returns true when
// the draft was applied.
export const restoreKeptTemplateDraft = <T>(params: {
  // Unsaved edits, or a file still uploading (it would land in the restored form).
  hasUnsavedWork: boolean;
  takeDraft: () => T | null;
  apply: (values: T) => void;
  confirmDialog?: (message: string) => boolean;
}): boolean => {
  const confirmDialog = params.confirmDialog ?? ((message: string) => window.confirm(message));
  if (params.hasUnsavedWork && !confirmDialog(EDITOR_RESTORE_DRAFT_MESSAGE)) {
    return false;
  }

  const values = params.takeDraft();
  if (!values) {
    return false;
  }

  params.apply(values);
  return true;
};

// The editor remounts for each template and for the new-template form (TemplateEditorRoute),
// so errors, selection, save state and in-flight saves never carry over between them.
export const templateEditorRouteKey = (id: string | undefined): string =>
  id ? `edit:${id}` : 'new';
