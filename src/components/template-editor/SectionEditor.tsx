import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChecklistSection } from "@/types/checklist";

interface SectionEditorProps {
  section: ChecklistSection;
  sectionIndex: number;
  onUpdateSection: (index: number, field: string, value: string) => void;
  errors: { type: string; message: string }[];
}

export const SectionEditor = ({
  section,
  sectionIndex,
  onUpdateSection,
  errors: _errors
}: SectionEditorProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Section details</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Keep section names short enough that the outline reads like a clean table of contents.
        </p>
      </div>

      <div>
        <Label htmlFor="section-title" className="text-base">Section Title (optional)</Label>
        <Input
          id="section-title"
          value={section.title}
          onChange={(e) => onUpdateSection(sectionIndex, "title", e.target.value)}
          placeholder={`Section ${sectionIndex + 1} title (optional)`}
          className="mt-2"
        />
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
        <p className="text-sm leading-6 text-muted-foreground">
          This section contains {section.items.length} task{section.items.length !== 1 ? 's' : ''}. Select a task from the outline to edit its details, or add another task to keep building.
        </p>
      </div>
    </div>
  );
};
