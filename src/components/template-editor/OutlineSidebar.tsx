import type { JSX } from "react";
import { Search, Settings } from "lucide-react";

import { SectionSidebar } from "@/components/template-editor/SectionSidebar";
import { cn } from "@/lib/utils";

export interface OutlineSidebarProps {
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  showingSEO: boolean;
  showingTemplateInfo: boolean;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onSelectSEO: () => void;
  onSelectTemplateInfo: () => void;
  onEntryPicked?: () => void;
}

export function OutlineSidebar({
  selectedSectionIndex,
  selectedItemIndex,
  showingSEO,
  showingTemplateInfo,
  onSelectSection,
  onSelectItem,
  onSelectSEO,
  onSelectTemplateInfo,
  onEntryPicked,
}: OutlineSidebarProps): JSX.Element {
  const outlineSelectionActive = !showingSEO && !showingTemplateInfo;
  const modeButtons = [
    {
      active: showingTemplateInfo,
      icon: Settings,
      label: "Template Settings",
      onClick: onSelectTemplateInfo,
    },
    {
      active: showingSEO,
      icon: Search,
      label: "Search & SEO",
      onClick: onSelectSEO,
    },
  ] as const;

  return (
    <div className="flex min-h-0 flex-col" data-slot="template-outline">
      <div className="flex flex-col gap-1 border-b p-2">
        {modeButtons.map(({ active, icon: Icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onClick();
              onEntryPicked?.();
            }}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-muted font-medium" : "hover:bg-muted/50",
            )}
          >
            <Icon className="size-4 text-muted-foreground" />
            {label}
          </button>
        ))}
      </div>

      <SectionSidebar
        outlineSelectionActive={outlineSelectionActive}
        selectedSectionIndex={selectedSectionIndex}
        selectedItemIndex={selectedItemIndex}
        onSelectSection={onSelectSection}
        onSelectItem={onSelectItem}
        onEntryPicked={onEntryPicked}
      />
    </div>
  );
}
