import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, X } from "lucide-react";
import { Page } from "@/types/page";
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorProps {
  page: Page | null;
  onSave: (title: string, content: string) => Promise<boolean>;
  onCancel: () => void;
}

export const MarkdownEditor = ({ page, onSave, onCancel }: MarkdownEditorProps) => {
  const [title, setTitle] = useState(page?.title || "");
  const [content, setContent] = useState(page?.content || "");
  const [isSaving, setIsSaving] = useState(false);

  // Update state when page changes
  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setContent(page.content);
    }
  }, [page]);

  const handleSave = async () => {
    setIsSaving(true);
    const success = await onSave(title, content);
    if (success) {
      // Don't clear or close here - let parent handle it
    }
    setIsSaving(false);
  };

  if (!page) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Select a page to edit</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit Page</h2>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Title Input */}
      <div className="p-4 border-b">
        <Label htmlFor="page-title">Page Title</Label>
        <Input
          id="page-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter page title"
          className="mt-1"
        />
      </div>

      {/* WYSIWYG Editor */}
      <div className="flex-1 p-4 pt-2 flex flex-col min-h-0">
        <div className="flex-1 min-h-0" data-color-mode="light">
          <style>{`
            .w-md-editor-toolbar {
              height: 50px !important;
              padding: 8px !important;
              border-bottom: 2px solid hsl(var(--border)) !important;
            }
            .w-md-editor-toolbar ul li button {
              height: 34px !important;
              width: 34px !important;
              font-size: 16px !important;
            }
            .w-md-editor-toolbar ul li {
              margin: 0 2px !important;
            }
            .w-md-editor {
              background-color: hsl(var(--background)) !important;
            }
            .w-md-editor-text {
              background-color: hsl(var(--background)) !important;
              color: hsl(var(--foreground)) !important;
            }
            .w-md-editor-preview ol {
              list-style: decimal !important;
              padding-left: 1.5rem !important;
              margin-bottom: 1rem !important;
            }
            .w-md-editor-preview ul {
              list-style: disc !important;
              padding-left: 1.5rem !important;
              margin-bottom: 1rem !important;
            }
          `}</style>
          <MDEditor
            value={content}
            onChange={(val: unknown) => setContent(val || "")}
            height="100%"
            preview="edit"
            hideToolbar={false}
            data-color-mode="light"
            visibleDragbar={false}
            textareaProps={{
              placeholder: "Write your markdown content here...",
              style: {
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              },
            }}
            previewOptions={{
              remarkPlugins: [remarkGfm],
            }}
          />
        </div>
      </div>
    </div>
  );
};