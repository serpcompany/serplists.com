import type { JSX } from "react";
import { useRef } from "react";

import { EDITOR_PANEL_HEADING_ID, EDITOR_PANEL_ID } from "@/components/template-editor/editorPanelIds";
import {
  OutlineSidebar,
  type OutlineSidebarProps,
} from "@/components/template-editor/OutlineSidebar";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface TemplateEditorOutlineProps extends Omit<OutlineSidebarProps, "onEntryPicked"> {
  besideForm: boolean;
  locked: boolean;
  onSheetOpenChange: (open: boolean) => void;
  sheetOpen: boolean;
}

export function TemplateEditorOutline({
  besideForm,
  locked,
  onSheetOpenChange,
  sheetOpen,
  ...outlineProps
}: TemplateEditorOutlineProps): JSX.Element {
  const revealPanelOnCloseRef = useRef(false);

  if (besideForm) {
    return (
      <Card className="sticky top-32 max-h-[calc(100dvh-9rem)] gap-0 overflow-y-auto py-0">
        <OutlineSidebar {...outlineProps} />
      </Card>
    );
  }

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={onSheetOpenChange}
      onOpenChangeComplete={(open) => {
        if (open) {
          revealPanelOnCloseRef.current = false;
        } else if (revealPanelOnCloseRef.current) {
          window.requestAnimationFrame(() => {
            document.getElementById(EDITOR_PANEL_ID)?.scrollIntoView({ block: "start" });
          });
        }
      }}
    >
      <SheetContent
        className="flex max-h-[85dvh] flex-col gap-0 p-0"
        finalFocus={() =>
          revealPanelOnCloseRef.current ? document.getElementById(EDITOR_PANEL_HEADING_ID) : true
        }
        side="bottom"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Outline</SheetTitle>
        </SheetHeader>
        <fieldset className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0" disabled={locked}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OutlineSidebar
              {...outlineProps}
              onEntryPicked={() => {
                revealPanelOnCloseRef.current = true;
                onSheetOpenChange(false);
              }}
            />
          </div>
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}
