import { Search, Settings } from "lucide-react";

import { SectionSidebar } from "@/components/template-editor/SectionSidebar";
import { cn } from "@/lib/utils";

interface OutlineSidebarProps {
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  showingSEO: boolean;
  showingTemplateInfo: boolean;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onSelectSEO: () => void;
  onSelectTemplateInfo: () => void;
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
    <aside className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border p-3">
        <nav className="flex flex-col gap-1">
        {modeButtons.map(({ active, icon: Icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        </nav>
      </div>

      <SectionSidebar
        outlineSelectionActive={outlineSelectionActive}
        selectedSectionIndex={selectedSectionIndex}
        selectedItemIndex={selectedItemIndex}
        onSelectSection={onSelectSection}
        onSelectItem={onSelectItem}
      />
    </aside>
  );
}
