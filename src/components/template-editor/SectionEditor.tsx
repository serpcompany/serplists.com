import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  errors
}: SectionEditorProps) => {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Edit Section</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="section-title" className="text-base">Section Title (optional)</Label>
            <Input
              id="section-title"
              value={section.title}
              onChange={(e) => onUpdateSection(sectionIndex, "title", e.target.value)}
              placeholder={`Section ${sectionIndex + 1} title (optional)`}
              className="mt-1"
            />
          </div>
          
          <div className="pt-4">
            <p className="text-sm text-muted-foreground">
              This section contains {section.items.length} task{section.items.length !== 1 ? 's' : ''}. 
              Select a task from the left to edit its details, or click "Add Task" to create a new one.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};