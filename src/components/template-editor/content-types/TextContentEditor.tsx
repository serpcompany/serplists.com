import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import { FileText } from "lucide-react";

interface TextContentEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const TextContentEditor = ({ value, onChange }: TextContentEditorProps) => {
  return (
    <div>
      <Label className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4" /> Text Content
      </Label>
      <Tabs defaultValue="edit">
        <TabsList className="mb-2">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text or markdown content"
            rows={6}
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="prose prose-sm max-w-none rounded-md border p-3 min-h-[150px]">
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};