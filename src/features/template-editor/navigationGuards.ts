export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  'You have unsaved template changes. Leave without saving?';

export const EDITOR_LOAD_LATEST_MESSAGE =
  'Load the latest saved version of this template? Your unsaved changes will be lost.';

export const EDITOR_UPLOAD_IN_PROGRESS_MESSAGE =
  'A file is still uploading. If you leave now, it will not be added to the template. Leave anyway?';

export const EDITOR_SAVE_IN_PROGRESS_MESSAGE =
  'Your template is still saving. If the save fails, your changes will be lost. Leave anyway?';

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

// For useBlocker: ask only when the editor route itself would change. A search or hash
// change keeps the editor mounted, so nothing is lost.
export const shouldBlockTemplateEditorTransition = ({
  shouldBlock,
  currentPath,
  nextPath,
}: {
  shouldBlock: boolean;
  currentPath: string;
  nextPath: string;
}): boolean => shouldBlock && currentPath !== nextPath;

export const confirmTemplateEditorNavigation = (
  shouldBlock: boolean,
  confirmDialog: (message: string) => boolean = (message) =>
    window.confirm(message),
  message: string = EDITOR_UNSAVED_CHANGES_MESSAGE,
): boolean => {
  if (!shouldBlock) {
    return true;
  }

  return confirmDialog(message);
};

export const applyTemplateBeforeUnloadWarning = (
  event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>,
  shouldBlock: boolean,
): void => {
  if (!shouldBlock) {
    return;
  }

  event.preventDefault();
  event.returnValue = '';
};
