import { AlertCircle, FileClock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { StoredTemplateDraft } from "@/features/template-editor/templateDraftStore";
import type { TemplateEditorAccessNotice } from "@/features/template-editor/templateEditorAccess";

type TemplateEditorAccessNoticesProps = {
  draft: StoredTemplateDraft | null;
  isStartingCheckout: boolean;
  notice: TemplateEditorAccessNotice | null;
  onDiscardDraft: () => void;
  onRestoreDraft: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
};

export function TemplateEditorAccessNotices({
  draft,
  isStartingCheckout,
  notice,
  onDiscardDraft,
  onRestoreDraft,
  onSignIn,
  onUpgrade,
}: TemplateEditorAccessNoticesProps): JSX.Element | null {
  if (!draft && !notice) {
    return null;
  }

  const draftTitle = draft?.values.title.trim() || "Untitled Template";

  return (
    <div className="space-y-3 px-4 py-4">
      {draft ? (
        <Alert className="bg-card shadow-none">
          <FileClock className="h-4 w-4" />
          <AlertTitle>Unsaved template draft</AlertTitle>
          <AlertDescription>
            <p>
              &ldquo;{draftTitle}&rdquo; was kept on this tab when it could not be saved.
              Restore it to keep working.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onRestoreDraft} size="sm" type="button">
                Restore draft
              </Button>
              <Button onClick={onDiscardDraft} size="sm" type="button" variant="outline">
                Discard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert className="border-destructive/40 bg-card shadow-none" variant="destructive">
          <AlertCircle className="h-4 w-4" />
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
