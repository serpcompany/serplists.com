import type { JSX } from "react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Code,
  File,
  FileText,
  Image,
  ListChecks,
  PanelRightOpen,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentAddPanelProps {
  showAddPanel: boolean;
  onTogglePanel: () => void;
  onAddContent: (
    contentType: "text" | "image" | "video" | "file" | "embed" | "subItems",
  ) => void;
}

export const ContentAddPanel = ({
  showAddPanel,
  onTogglePanel,
  onAddContent,
}: ContentAddPanelProps): JSX.Element => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const contentTypeButtons = [
    { type: "text" as const, icon: FileText, label: "Text" },
    { type: "image" as const, icon: Image, label: "Image" },
    { type: "video" as const, icon: Video, label: "Video" },
    { type: "file" as const, icon: File, label: "File" },
    { type: "embed" as const, icon: Code, label: "Embed" },
    { type: "subItems" as const, icon: ListChecks, label: "Sub-tasks" },
  ];

  useEffect(() => {
    if (!showAddPanel) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      onTogglePanel();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onTogglePanel, showAddPanel]);

  return (
    <div ref={menuRef} className="relative inline-flex">
      <Button variant="ghost" size="sm" onClick={onTogglePanel} type="button">
        <PanelRightOpen className="mr-2 h-4 w-4" />
        Add Block
      </Button>

      {showAddPanel ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
          {contentTypeButtons.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => onAddContent(type)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
