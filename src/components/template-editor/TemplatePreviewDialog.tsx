import type { JSX } from "react";

import { PublicTemplateContent } from "@/components/template/PublicTemplateContent";
import { RequiredToolsList } from "@/components/template/RequiredToolsList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import { normalizeTemplateEditorRequiredTools } from "@/lib/forms/templateEditorRequiredTools";

interface TemplatePreviewDialogProps {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requiredTools: TemplateEditorFormValues["requiredTools"];
  sections: TemplateEditorFormValues["sections"];
  title: string;
}

const everyTaskExpanded = (sections: TemplateEditorFormValues["sections"]) =>
  Object.fromEntries(
    sections.flatMap((section, sectionIndex) =>
      section.items.map((_, itemIndex) => [`${sectionIndex}-${itemIndex}`, true]),
    ),
  );

export function TemplatePreviewDialog({
  description,
  onOpenChange,
  open,
  requiredTools,
  sections,
  title,
}: TemplatePreviewDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Template preview</DialogTitle>
          <DialogDescription>
            This preview reflects the current draft. Saving is not required.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t px-4">
          <div className="flex flex-col gap-2 border-b py-4">
            <h2 className="text-2xl font-semibold tracking-tight wrap-break-word">
              {title || "Untitled Template"}
            </h2>
            {description ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <RequiredToolsList
            className="border-b py-4"
            headingLevel="h3"
            tools={normalizeTemplateEditorRequiredTools(requiredTools).filter((tool) => tool.name)}
          />
          <PublicTemplateContent initialExpandedItems={everyTaskExpanded(sections)} sections={sections} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
