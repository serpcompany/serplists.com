import { PageSelector } from "@/components/ui/page-selector";
import { Page } from "@/types/page";

interface PageContentEditorProps {
  value: string;
  pageId?: string;
  pages: Page[];
  onValueChange: (value: string) => void;
  onUpdateMeta: (updates: unknown) => void;
}

export const PageContentEditor: ({ value, pageId, pages, onValueChange, onUpdateMeta }: PageContentEditorProps) => Element = ({ 
  value, 
  pageId, 
  pages, 
  onValueChange, 
  onUpdateMeta 
}: PageContentEditorProps) : Element=> {
  return (
    <div>
      <PageSelector
        value={pageId || value}
        onValueChange={(value: string) => {
          onValueChange(value);
          onUpdateMeta({ pageId: value });
        }}
        pages={pages}
      />
      {pageId && (
        <div className="mt-3 p-3 border rounded-md bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Page will be embedded here when viewing the checklist.
          </p>
        </div>
      )}
    </div>
  );
};