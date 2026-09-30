import { Lock } from "lucide-react";

import { DashboardContentShell } from "@/components/dashboard/DashboardContentShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
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
    <DashboardContentShell width="narrow">
      <Alert>
        <Lock />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        {templateId ? (
          <Link
            href={buildConsoleTemplatePath(templateId)}
            className={buttonVariants()}
          >View template</Link>
        ) : null}
        <Link
          href={buildConsoleTemplatesPath()}
          className={buttonVariants({ variant: 'outline' })}
        >Back to Templates</Link>
      </div>
    </DashboardContentShell>
  );
}
