import type { JSX } from "react";
import { AlertCircle, FileClock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { StoredTemplateDraft } from "@/features/template-editor/templateDraftStore";
import type { TemplateEditorAccessNotice } from "@/features/template-editor/templateEditorAccess";
import type { OtherContextTemplateDraft } from "@/features/template-editor/useOtherContextTemplateDraft";

type TemplateEditorAccessNoticesProps = {
  draft: StoredTemplateDraft | null;
  draftActionsDisabled?: boolean;
  isStartingCheckout: boolean;
  notice: TemplateEditorAccessNotice | null;
  onDiscardDraft: () => void;
  onRestoreDraft: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
  otherContextDraft?: OtherContextTemplateDraft | null;
  onSwitchToDraftContext?: () => void;
  onDiscardOtherContextDraft?: () => void;
};

export function TemplateEditorAccessNotices({
  draft,
  draftActionsDisabled = false,
  isStartingCheckout,
  notice,
  onDiscardDraft,
  onRestoreDraft,
  onSignIn,
  onUpgrade,
  otherContextDraft,
  onSwitchToDraftContext,
  onDiscardOtherContextDraft,
}: TemplateEditorAccessNoticesProps): JSX.Element | null {
  if (!draft && !notice && !otherContextDraft) {
    return null;
  }

  const draftTitle = draft?.values.title.trim() || "Untitled Template";
  const otherDraftTitle = otherContextDraft?.draft.values.title.trim() || "Untitled Template";

  return (
    <div className="flex flex-col gap-3">
      {draft ? (
        <Alert>
          <FileClock />
          <AlertTitle>Unsaved template draft</AlertTitle>
          <AlertDescription>
            <p>
              &ldquo;{draftTitle}&rdquo; was kept on this tab when it could not be saved.
              Restore it to keep working.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={draftActionsDisabled} onClick={onRestoreDraft} size="sm" type="button">
                Restore draft
              </Button>
              <Button
                disabled={draftActionsDisabled}
                onClick={onDiscardDraft}
                size="sm"
                type="button"
                variant="outline"
              >
                Discard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {otherContextDraft ? (
        <Alert>
          <FileClock />
          <AlertTitle>Unsaved template draft in {otherContextDraft.name}</AlertTitle>
          <AlertDescription>
            <p>
              &ldquo;{otherDraftTitle}&rdquo; was kept on this tab when it could not be saved.
              Switch to {otherContextDraft.name} to restore it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onSwitchToDraftContext} size="sm" type="button">
                Switch to {otherContextDraft.name}
              </Button>
              <Button onClick={onDiscardOtherContextDraft} size="sm" type="button" variant="outline">
                Discard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>
            <p>{notice.message}</p>
            {notice.action ? (
              <div className="mt-3">
                {notice.action === "checkout" ? (
                  <Button
                    disabled={isStartingCheckout}
                    onClick={onUpgrade}
                    size="sm"
                    type="button"
                  >
                    {isStartingCheckout ? "Opening checkout..." : "Upgrade to Pro"}
                  </Button>
                ) : (
                  <Button onClick={onSignIn} size="sm" type="button">
                    Sign in
                  </Button>
                )}
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
