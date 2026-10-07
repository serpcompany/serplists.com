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

export const shouldBlockTemplateEditorNavigation = ({
  isDirty,
  loading,
  hasPendingUploads = false,
}: {
  isDirty: boolean;
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

export const confirmReplaceTemplateDraft = (
  isDirty: boolean,
  confirmDialog: (message: string) => boolean = (message) => window.confirm(message),
): boolean => !isDirty || confirmDialog(EDITOR_REPLACE_DRAFT_MESSAGE);

export const restoreKeptTemplateDraft = <T>(params: {
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

export const templateEditorRouteKey = (id: string | undefined): string =>
  id ? `edit:${id}` : 'new';
