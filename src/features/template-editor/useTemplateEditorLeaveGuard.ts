import { EDITOR_UNSAVED_CHANGES_MESSAGE } from "@/features/template-editor/navigationGuards";
import { usePageRestoredFromCache } from "@/hooks/useRedirectPending";
import { useUnsavedChangesGuard } from "@/lib/navigation/useUnsavedChangesGuard";

// Asks before unsaved template edits are lost, whichever way the user leaves: any route
// change (sidebar, header, account menu, the editor's back button, and browser
// Back/Forward), signing out, and reloads or tab closes (useUnsavedChangesGuard).
// Editor routes share this component, so a new route starts guarded again.
// A session that ends in the background unmounts the editor without asking; `keepWork`
// then keeps the edits on this tab (see leaveGuard.ts) and returns true when it did.
// `message` is the question asked in the app (browsers show their own on unload).
export const useTemplateEditorLeaveGuard = (
  shouldBlock: boolean,
  message: string = EDITOR_UNSAVED_CHANGES_MESSAGE,
  keepWork?: () => boolean,
) => {
  const guard = useUnsavedChangesGuard(shouldBlock, message, keepWork);
  // allowLeave covers the checkout redirect once the edits are kept. Back from it can
  // restore this page from the back/forward cache with the exit still allowed. The user
  // is here again, so edits made now must ask again.
  usePageRestoredFromCache(guard.guardLeave);
  return guard;
};
