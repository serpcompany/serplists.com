import { EDITOR_UNSAVED_CHANGES_MESSAGE } from "@/features/template-editor/navigationGuards";
import { usePageRestoredFromCache } from "@/hooks/useRedirectPending";
import { useUnsavedChangesGuard } from "@/lib/navigation/useUnsavedChangesGuard";

export const useTemplateEditorLeaveGuard = (
  shouldBlock: boolean,
  message: string = EDITOR_UNSAVED_CHANGES_MESSAGE,
  keepWork?: () => boolean,
) => {
  const guard = useUnsavedChangesGuard(shouldBlock, message, keepWork);
  usePageRestoredFromCache(guard.guardLeave);
  return guard;
};
