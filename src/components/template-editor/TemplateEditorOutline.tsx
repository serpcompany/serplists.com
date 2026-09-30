import type { JSX } from "react";
import { useRef } from "react";

import {
  OutlineSidebar,
  type OutlineSidebarProps,
} from "@/components/template-editor/OutlineSidebar";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// EditorPanels' section and its heading, which a pick in the sheet brings into view.
const EDITOR_PANEL_ID = "template-editor-panel";
const EDITOR_PANEL_HEADING_ID = "template-editor-panel-title";

interface TemplateEditorOutlineProps extends Omit<OutlineSidebarProps, "onEntryPicked"> {
  // From lg up the outline is a card beside the form; below, a bottom sheet that the editor
  // header's Outline button opens.
  besideForm: boolean;
  // A create saving or a Clipy draft generating. The sheet renders outside the page's locked
  // fieldset, so it locks its own.
  locked: boolean;
  onSheetOpenChange: (open: boolean) => void;
  sheetOpen: boolean;
}

// Where the template editor's outline sits. In the sheet, picking or adding an entry closes it
// and moves focus to that entry's form, scrolled into view under the top bars.
export function TemplateEditorOutline({
  besideForm,
  locked,
  onSheetOpenChange,
  sheetOpen,
  ...outlineProps
}: TemplateEditorOutlineProps): JSX.Element {
  // Set by a pick, and cleared when the sheet opens again: the close that follows a pick hands
  // focus to the picked entry's form and scrolls it into view, whichever runs first.
  const revealPanelRef = useRef(false);

  if (besideForm) {
    return (
      // In view while the form scrolls, under the console's and the editor's top bars.
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
          revealPanelRef.current = false;
        } else if (revealPanelRef.current) {
          // A frame later, so the page's scroll is already back from the sheet's scroll lock.
          window.requestAnimationFrame(() => {
            document.getElementById(EDITOR_PANEL_ID)?.scrollIntoView({ block: "start" });
          });
        }
      }}
    >
      <SheetContent
        className="flex max-h-[85dvh] flex-col gap-0 p-0"
        finalFocus={() =>
          revealPanelRef.current ? document.getElementById(EDITOR_PANEL_HEADING_ID) : true
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
                revealPanelRef.current = true;
                onSheetOpenChange(false);
              }}
            />
          </div>
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}
