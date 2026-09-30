import type { JSX } from "react";
import {
  Code,
  File,
  FileText,
  Image,
  ListChecks,
  PanelRightOpen,
  Video,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TemplateEditorContentType } from "@/lib/forms/templateEditorForm";

const CONTENT_TYPES = [
  { type: "text", icon: FileText, label: "Text" },
  { type: "image", icon: Image, label: "Image" },
  { type: "video", icon: Video, label: "Video" },
  { type: "file", icon: File, label: "File" },
  { type: "embed", icon: Code, label: "Embed" },
  { type: "subItems", icon: ListChecks, label: "Sub-tasks" },
] as const satisfies ReadonlyArray<{
  type: TemplateEditorContentType;
  icon: LucideIcon;
  label: string;
}>;

interface ContentAddPanelProps {
  onAddContent: (contentType: TemplateEditorContentType) => void;
}

// Add Block: a shadcn DropdownMenu of the content block types a task can hold.
export const ContentAddPanel = ({ onAddContent }: ContentAddPanelProps): JSX.Element => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button size="sm" type="button" variant="outline" />}>
      <PanelRightOpen data-icon="inline-start" />
      Add Block
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {CONTENT_TYPES.map(({ type, icon: Icon, label }) => (
        <DropdownMenuItem key={type} onClick={() => onAddContent(type)}>
          <Icon />
          {label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
