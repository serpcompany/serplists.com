import { Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buildConsoleTemplatePath, buildConsoleTemplatesPath } from "@/lib/routes";

import { Link } from '@/components/navigation/Link';

type TemplateEditorReadOnlyNoticeProps = {
  // The template the edit link was for; absent on the new-template route.
  templateId?: string;
  reason: "organization_role" | "not_owner";
};

// Shown instead of the editor when the viewer could open the link but not save from it
// (the API refuses the save), so no one edits work that can only end in "Forbidden".
export function TemplateEditorReadOnlyNotice({ templateId, reason }: TemplateEditorReadOnlyNoticeProps) {
  const title = templateId ? "You can't edit this template" : "You can't create templates here";
  let message = "Only its owner can edit it.";
  if (reason === "organization_role") {
    message = templateId
      ? "Your role in its Organization lets you view this template but not edit it."
      : "Your role in this Organization lets you view templates but not create them.";
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4 flex flex-wrap gap-2">
        {templateId ? (
          <Button asChild>
            <Link href={buildConsoleTemplatePath(templateId)}>View template</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={buildConsoleTemplatesPath()}>Back to Templates</Link>
        </Button>
      </div>
    </div>
  );
}
