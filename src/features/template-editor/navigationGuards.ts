export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  'You have unsaved template changes. Leave without saving?';

export const shouldBlockTemplateEditorNavigation = ({
  isDirty,
  isSaving,
  loading,
}: {
  isDirty: boolean;
  isSaving: boolean;
  loading: boolean;
}): boolean => isDirty && !isSaving && !loading;

export const confirmTemplateEditorNavigation = (
  shouldBlock: boolean,
  confirmDialog: (message: string) => boolean = (message) =>
    window.confirm(message),
): boolean => {
  if (!shouldBlock) {
    return true;
  }

  return confirmDialog(EDITOR_UNSAVED_CHANGES_MESSAGE);
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
